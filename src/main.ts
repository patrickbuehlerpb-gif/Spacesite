import '@fontsource-variable/manrope';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/chrome.css';
import './core/strings';
import { App } from './core/App';
import { lang } from './core/i18n';

document.documentElement.lang = lang();
const app = new App();
app.start();
