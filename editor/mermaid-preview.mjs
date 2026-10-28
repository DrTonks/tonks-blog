import mermaid from 'mermaid';
import {mountMermaid} from '../src/utils/mermaid-runtime.js';
mountMermaid(document.querySelector('.custom-md'), () => Promise.resolve(mermaid));
