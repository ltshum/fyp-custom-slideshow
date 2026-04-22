// MathJax 4 LaTex typesetter, based on jupyterlab-mathjax3 extension
// https://pypi.org/project/jupyterlab-mathjax3

import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ILatexTypesetter } from '@jupyterlab/rendermime';
import { mathjax } from '@mathjax/src/mjs/mathjax';
import { TeX } from '@mathjax/src/mjs/input/tex';
import '@mathjax/src/mjs/input/tex/html/HtmlConfiguration';
// the cause of source map parsing warnings (https://github.com/webyonet/react-native-mathjax-html-to-svg/issues/15)
import { SVG } from '@mathjax/src/mjs/output/svg';
import { SafeHandler } from '@mathjax/src/mjs/ui/safe/SafeHandler';
import { HTMLHandler } from '@mathjax/src/mjs/handlers/html/HTMLHandler';
import { browserAdaptor } from '@mathjax/src/mjs/adaptors/browserAdaptor';
import { PLUGIN_ID } from '../constants';

mathjax.handlers.register(SafeHandler(new HTMLHandler(browserAdaptor())));

export class MathJax4Typesetter implements ILatexTypesetter {
  constructor() {
    const svg = new SVG();
    const tex = new TeX({
      inlineMath: [
        ['$', '$'],
        ['\\(', '\\)']
      ],
      displayMath: [
        ['$$', '$$'],
        ['\\[', '\\]']
      ],
      packages: ['base', 'html'],
      processEscapes: true,
      processEnvironments: true
    });
    this._html = mathjax.document(window.document, {
      InputJax: tex,
      OutputJax: svg
    });
  }

  typeset(node: HTMLElement): void {
    this._html
      .clear()
      .findMath({ elements: [node] })
      .compile()
      .getMetrics()
      .typeset()
      .updateDocument();
  }
  private _html: any;
}

const plugin: JupyterFrontEndPlugin<ILatexTypesetter> = {
  id: `${PLUGIN_ID}:mathjax`,
  description: 'MathJax 4 typesetter',
  requires: [],
  provides: ILatexTypesetter,
  activate: () => new MathJax4Typesetter(),
  autoStart: true
};

export default plugin;
