/**
 * Tiny dependency-free XML parser for the data build scripts (Open Exoplanet Catalogue system files).
 *
 * Supported: elements, attributes (double- or single-quoted), text, self-closing tags, comments / processing
 * instructions / DOCTYPE (skipped), the five predefined entities (&amp; &lt; &gt; &quot; &apos;) and numeric
 * character references (&#…; / &#x…;). CDATA sections are passed through as text. Not supported (not needed):
 * namespaces, DTD-defined entities, internal DOCTYPE subsets.
 *
 * Node shape: `{ tag, attrs: { name: value }, children: Node[], text }` where `text` is the trimmed direct text
 * content of the element (child element text is NOT included).
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode XML character entities in a string. Unknown named entities are left untouched. */
export function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}

const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13;

/**
 * Parse an XML document. Returns the root element node; throws on malformed input
 * (mismatched tags, unterminated constructs).
 */
export function parseXML(src) {
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // BOM
  const n = src.length;
  const doc = { tag: '#document', attrs: {}, children: [], text: '' };
  const stack = [doc];
  let i = 0;

  const top = () => stack[stack.length - 1];
  const fail = (msg, at) => { throw new Error(`XML: ${msg} at offset ${at}`); };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { top().text += decodeEntities(src.slice(i)); break; }
    if (lt > i) top().text += decodeEntities(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      if (e < 0) fail('unterminated comment', lt);
      i = e + 3; continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      if (e < 0) fail('unterminated CDATA section', lt);
      top().text += src.slice(lt + 9, e);
      i = e + 3; continue;
    }
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      if (e < 0) fail('unterminated processing instruction', lt);
      i = e + 2; continue;
    }
    if (src.startsWith('<!', lt)) { // DOCTYPE etc. (no internal subset support)
      const e = src.indexOf('>', lt + 2);
      if (e < 0) fail('unterminated declaration', lt);
      i = e + 1; continue;
    }
    if (src.charCodeAt(lt + 1) === 47 /* / */) { // closing tag
      const e = src.indexOf('>', lt + 2);
      if (e < 0) fail('unterminated closing tag', lt);
      const tag = src.slice(lt + 2, e).trim();
      const node = top();
      if (node === doc) fail(`unexpected closing tag </${tag}>`, lt);
      if (node.tag !== tag) fail(`mismatched closing tag </${tag}> (open element is <${node.tag}>)`, lt);
      node.text = node.text.trim();
      stack.pop();
      i = e + 1; continue;
    }

    // start tag
    let j = lt + 1;
    while (j < n) { const c = src.charCodeAt(j); if (isSpace(c) || c === 47 || c === 62) break; j++; }
    const tag = src.slice(lt + 1, j);
    if (!tag) fail('empty tag name', lt);
    const attrs = {};
    let selfClosing = false;
    for (;;) {
      while (j < n && isSpace(src.charCodeAt(j))) j++;
      if (j >= n) fail(`unterminated start tag <${tag}>`, lt);
      const c = src.charCodeAt(j);
      if (c === 62 /* > */) { j++; break; }
      if (c === 47 /* / */) {
        if (src.charCodeAt(j + 1) !== 62) fail(`unexpected "/" in <${tag}>`, j);
        selfClosing = true; j += 2; break;
      }
      let k = j;
      while (k < n) { const d = src.charCodeAt(k); if (isSpace(d) || d === 61 || d === 47 || d === 62) break; k++; }
      const name = src.slice(j, k);
      if (!name) fail(`bad attribute in <${tag}>`, j);
      j = k;
      while (j < n && isSpace(src.charCodeAt(j))) j++;
      if (src.charCodeAt(j) === 61 /* = */) {
        j++;
        while (j < n && isSpace(src.charCodeAt(j))) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, j + 1);
          if (e < 0) fail(`unterminated attribute value for ${name} in <${tag}>`, j);
          attrs[name] = decodeEntities(src.slice(j + 1, e));
          j = e + 1;
        } else { // tolerate unquoted values
          let e = j;
          while (e < n) { const d = src.charCodeAt(e); if (isSpace(d) || d === 62 || (d === 47 && src.charCodeAt(e + 1) === 62)) break; e++; }
          attrs[name] = decodeEntities(src.slice(j, e));
          j = e;
        }
      } else attrs[name] = ''; // tolerate valueless attributes
    }
    const node = { tag, attrs, children: [], text: '' };
    top().children.push(node);
    if (!selfClosing) stack.push(node);
    i = j;
  }

  if (stack.length > 1) fail(`unclosed element <${top().tag}>`, n);
  if (!doc.children.length) fail('no root element', 0);
  return doc.children[0];
}

/** First child element with the given tag (or undefined). */
export const child = (node, tag) => node.children.find((c) => c.tag === tag);

/** All child elements with the given tag. */
export const children = (node, tag) => node.children.filter((c) => c.tag === tag);

/** Trimmed text of the first child with the given tag; null if the child is missing. */
export function text(node, tag) {
  const c = child(node, tag);
  return c ? c.text : null;
}

/** Numeric value of the first child with the given tag; null if missing, empty (e.g. `<mass upperlimit=".."/>`) or not a number. */
export function num(node, tag) {
  const c = child(node, tag);
  if (!c) return null;
  const v = parseFloat(c.text);
  return Number.isFinite(v) ? v : null;
}
