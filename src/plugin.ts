import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PLUGIN_ID, SlideType, Transition } from './constants';
import { Cell, Slide, Subslide, Fragment } from './slideType';
import Reveal from 'reveal.js';
import '../node_modules/reveal.js/dist/reveal.css';
import { MathJax4 } from './mathjax4.js';
import '@svgdotjs/svg.js';

// avoid implicit any error
declare const window: any;

const plugin = (
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
  settings: ISettingRegistry
) => {
  const { commands } = app;
  // console.log('App:');
  // console.log(app);
  // console.log('Tracker:');
  // console.log(tracker);
  // console.log('Settings:');
  // console.log(settings);

  let panel: NotebookPanel;
  let windowedPanel: HTMLElement;
  let windowingMode: 'defer' | 'full' | 'none';
  let csSettings: any = {};

  let slideToggle = false;
  let layout: any[] = [];
  let slides: any[] = [];

  let reveal: Reveal.Api | null = null;
  // Animate plugin by Asvin Goel (https://github.com/rajgoel/reveal.js-plugins)
  // does not work when imported at the top
  import('./rajgoel/animate.js');
  import('./rajgoel/loadcontent.js');

  // settings
  const loadSettings = (setting: any) => {
    return {
      dummy: setting.get('dummy').composite as boolean,
      default_transition: setting.get('default_transition')
        .composite as Transition
    };
  };

  Promise.all([app.restored, settings.load(PLUGIN_ID)]).then(
    ([, settingRes]) => {
      csSettings = loadSettings(settingRes);
      // update settings
      settingRes.changed.connect(() => {
        console.log('custom-slideshow settings updated:');
        csSettings = loadSettings(settingRes);
        console.log(csSettings);
      });

      // main menu commands
      commands.addCommand('slideshow:start-first', {
        label: 'Start from first cell',
        isEnabled: () => !slideToggle,
        execute: async () => {
          try {
            initReveal();
          } catch (e) {
            console.error('Error starting slideshow:');
            console.error(e);
          }
        }
      });

      commands.addCommand('slideshow:start-current', {
        label: 'Start from current cell',
        isEnabled: () => !slideToggle,
        execute: () => {
          try {
            initReveal('current');
          } catch (e) {
            console.error('Error starting slideshow:');
            console.error(e);
          }
        }
      });

      // placeholder command & emergency exit
      commands.addCommand('slideshow:exit', {
        label: 'Exit slideshow',
        isEnabled: () => slideToggle,
        execute: () => {
          try {
            exitReveal();
          } catch (e) {
            console.error('Error exiting slideshow: ');
            console.error(e);
          }
        }
      });
    }
  );

  const initReveal = (mode: 'first' | 'current' = 'first') => {
    slideToggle = true;
    layout = [];
    slides = [];

    if (tracker.currentWidget) {
      panel = tracker.currentWidget;
      panel.context.ready.then(async () => {
        miscStyles(panel);
        await getCells(panel).then(async cells => {
          cells.forEach((cell, index) => {
            const slideType = cell.model.metadata.slideshow?.slide_type;
            const transition = cell.model.metadata.slideshow?.transition;
            const transitionOut = cell.model.metadata.slideshow?.transition_out;
            const transitionDuration =
              cell.model.metadata.slideshow?.transition_duration ?? 0.5;
            switch (slideType) {
              case SlideType.SLIDE: {
                layout.push(
                  new Slide(
                    index,
                    cell,
                    transition,
                    transitionOut,
                    transitionDuration
                  )
                );
                break;
              }
              case SlideType.SUBSLIDE: {
                layout.push(
                  layout.length === 0
                    ? new Slide(
                        index,
                        cell,
                        transition,
                        transitionOut,
                        transitionDuration
                      )
                    : new Subslide(
                        index,
                        cell,
                        transition,
                        transitionOut,
                        transitionDuration
                      )
                );
                break;
              }
              case SlideType.FRAGMENT: {
                if (layout.length === 0) {
                  layout.push(
                    new Slide(
                      index,
                      cell,
                      transition,
                      transitionOut,
                      transitionDuration
                    )
                  );
                } else {
                  // add to last slide
                  layout[layout.length - 1].fragments.push(
                    new Fragment(index, cell, transition, transitionDuration)
                  );
                }
                break;
              }
              case SlideType.SKIP: {
                break;
              }
              // no slide type
              default: {
                if (layout.length === 0) {
                  layout.push(
                    new Slide(
                      index,
                      cell,
                      transition,
                      transitionOut,
                      transitionDuration
                    )
                  );
                } else {
                  const lastSlide = layout[layout.length - 1];
                  // add to last fragment
                  if (lastSlide.fragments.length > 0) {
                    lastSlide.fragments[
                      lastSlide.fragments.length - 1
                    ].children.push(new Cell(index, cell));
                  } else {
                    lastSlide.children.push(new Cell(index, cell));
                  }
                }
                break;
              }
            }
          });

          for (let i = 0; i < layout.length; i++) {
            if (layout[i] instanceof Slide) {
              const slideOuter = document.createElement('section');
              if (layout[i].transition) {
                let transition = layout[i].transition;
                if (layout[i].transitionOut) {
                  transition += `-in ${layout[i].transitionOut}-out`;
                }
                slideOuter.setAttribute('data-transition', transition);
              }
              slideOuter.style.transitionDuration = `${layout[i].transitionDuration}s`;
              const slideInner = document.createElement('section');
              slideOuter.appendChild(slideInner);
              addToRevealSlide(slideInner, layout[i]);
              slides.push(slideOuter);
            } else if (layout[i] instanceof Subslide) {
              const subslide = document.createElement('section');
              addToRevealSlide(subslide, layout[i]);
              slides[slides.length - 1].appendChild(subslide);
            }
          }

          const revealContainer = document.createElement('div');
          revealContainer.className = 'reveal';
          const revealSlides = document.createElement('div');
          revealSlides.className = 'slides';
          for (let i = 0; i < slides.length; i++) {
            revealSlides.appendChild(slides[i]);
          }
          revealContainer.appendChild(revealSlides);
          panel.content.node.insertBefore(
            revealContainer,
            panel.content.node.firstChild
          );
          reveal = new Reveal(revealContainer, {
            // @ts-expect-error: required for Animate plugin to work
            animate: {
              autoplay: true
            },
            plugins: [MathJax4, window.RevealLoadContent, window.RevealAnimate],
            transition: csSettings.default_transition || 'slide'
          });
          await reveal.initialize().then(() => {
            if (reveal !== null) {
              if (mode === 'first') {
                reveal.slide(0, 0);
              } else if (mode === 'current') {
                let activeIndex = panel.content.activeCellIndex || 0;

                while (
                  ![
                    SlideType.SLIDE,
                    SlideType.SUBSLIDE,
                    SlideType.FRAGMENT
                  ].includes(
                    cells[activeIndex].model.metadata.slideshow?.slide_type
                  ) &&
                  activeIndex > 0
                ) {
                  activeIndex--;
                }
                const activeCell = cells[activeIndex];
                const slides = reveal.getHorizontalSlides();
                let cellFound = false;
                // find horizontal slide index
                for (let i = 0; i < slides.length; i++) {
                  if (cellFound) {
                    break;
                  }
                  // find vertical slide index
                  for (let j = 0; j < slides[i].children.length; j++) {
                    if (
                      slides[i].children[j].innerHTML.includes(
                        activeCell.node.innerHTML
                      )
                    ) {
                      // find fragment index
                      let fragment = undefined;
                      if (slides[i].children[j].children.length > 1) {
                        for (
                          let k = 0;
                          k < slides[i].children[j].children.length;
                          k++
                        ) {
                          if (
                            slides[i].children[j].children[
                              k
                            ].innerHTML.includes(activeCell.node.innerHTML)
                          ) {
                            fragment = k - 1;
                            break;
                          }
                        }
                      }
                      reveal.slide(i, j, fragment);
                      cellFound = true;
                      break;
                    }
                  }
                }
              }
            }
          });
          // console.log(`Reveal.js plugins: ${reveal.getPlugins()}`);
        });
        document.addEventListener('fullscreenchange', exitRevealEvent);
        await panel.content.node.requestFullscreen();
      });
    }
  };

  const exitRevealEvent = () => {
    if (!document.fullscreenElement) {
      exitReveal();
    }
  };

  const addToRevealSlide = (slide: any, item: any) => {
    if (
      item.cell.model.type === 'code' &&
      item.cell.model.metadata.slideshow?.hide_code
    ) {
      item.cell.node.classList.add('hide-code');
    }
    if (item.transition) {
      let transition = item.transition;
      if (item.transitionOut) {
        transition += `-in ${item.transitionOut}-out`;
      }
      slide.setAttribute('data-transition', transition);
    }
    slide.style.transitionDuration = `${item.transitionDuration}s`;
    const container = document.createElement('div');
    // cannot use "container.appendChild(item.cell.node)", which converts all multi-backslashes into single backslashes
    container.appendChild(item.cell.node);

    item.children?.forEach((child: any) => {
      addToRevealSlide(container, child);
    });
    slide.appendChild(container);
    item.fragments?.forEach((fragment: any) => {
      const fragContainer = document.createElement('div');
      fragContainer.classList.add('fragment');
      switch (fragment.transition) {
        case Transition.SLIDE: {
          fragContainer.classList.add(
            fragment.cell.model.metadata.slideshow?.slide_dir === 'vertical'
              ? 'fade-up'
              : 'fade-left'
          );
          break;
        }
        case Transition.ZOOM: {
          fragContainer.classList.add('zoom');
          break;
        }
        case Transition.NONE: {
          fragContainer.classList.add('none');
          break;
        }
      }
      addToRevealSlide(fragContainer, fragment);
      slide.appendChild(fragContainer);
    });
  };

  // init DOM elements
  /* 
  <(sub)slide>
    slides
    children
    fragments
    more children
  </(sub)slide>
  */

  // cell styles
  const customStyle = (item: any, add: boolean = true) => {
    // select both rendered and raw cells
    document
      .querySelectorAll(
        `
      .cell${item.index} .cm-scroller,
      .cell${item.index} .jp-RenderedMarkdown,
      .cell${item.index} .jp-RenderedText *
    `
      )
      .forEach(child => {
        if (add) {
          // console.log(window.getComputedStyle(child).fontSize);
          // TODO: put in metadata for cell size, position, etc.
          // placeholder style for not having to squeeze eyes
          child.setAttribute('style', 'font-size: 200%;');
        } else {
          child.removeAttribute('style');
        }
      });
    if (!add) {
      item.cell.node.classList.remove(`cell${item.index}`);
    }
    item.children?.forEach((child: any) => {
      customStyle(child, add);
    });
    item.fragments?.forEach((fragment: any) => {
      customStyle(fragment, add);
    });
  };

  const exitReveal = () => {
    slideToggle = false;
    clearAll(panel);
    document.removeEventListener('fullscreenchange', exitRevealEvent);
    panel.content.node.removeChild(panel.content.node.firstChild!);
    reveal?.destroy();
  };

  // clean up notebook layout for slideshow
  const miscStyles = async (panel: NotebookPanel, start: boolean = true) => {
    if (start) {
      panel.content.addClass('slide-container');
      panel.toolbar.addClass(SlideType.HIDDEN);

      // stop windowing update, which messes with cell rendering
      // code ref: jupyterlab-rise
      windowingMode = panel.content.notebookConfig.windowingMode;
      panel.content.notebookConfig = {
        ...panel.content.notebookConfig,
        windowingMode: 'none'
      };
      // detach cells
      windowedPanel = document.querySelector(
        '.slide-container .jp-WindowedPanel-viewport'
      ) as HTMLElement;
      await getCells(panel).then(cells => {
        cells.forEach(cell => {
          try {
            windowedPanel.removeChild(cell.node);
          } catch (e) {
            /* cell is already detached by Jupyter windowing */
          }
        });
      });

      // for (let i = 0; i < panel.content.node.children.length; i++) {
      //   panel.content.node.children.item(i)?.classList.add(SlideType.HIDDEN);
      // }
      const footers = document.querySelectorAll('.jp-Notebook-footer');
      for (let i = 0; i < footers.length; i++) {
        footers.item(i)?.classList.add(SlideType.HIDDEN);
      }
    } else {
      panel.content.removeClass('slide-container');
      panel.toolbar.removeClass(SlideType.HIDDEN);

      // resume windowing update
      panel.content.notebookConfig = {
        ...panel.content.notebookConfig,
        windowingMode: windowingMode
      };
      // reattach cells
      await getCells(panel).then(cells => {
        cells.forEach(cell => {
          windowedPanel.appendChild(cell.node);
        });
      });

      for (let i = 0; i < panel.content.node.children.length; i++) {
        panel.content.node.children.item(i)?.classList.remove(SlideType.HIDDEN);
      }
      const footers = document.querySelectorAll('.jp-Notebook-footer');
      for (let i = 0; i < footers.length; i++) {
        footers.item(i)?.classList.remove(SlideType.HIDDEN);
      }
    }
  };

  const getCells = async (panel: NotebookPanel) => {
    let cells: any[] = [];
    await panel.context.ready;
    await Promise.all(panel.content.widgets.map(cell => cell.ready)).then(
      () => {
        cells = [...panel.content.widgets];
      }
    );
    return cells;
  };

  const clearStyles = (node: any, slideType: boolean = true) => {
    if (slideType) {
      node.classList.remove(...Object.values(SlideType));
    }
    node.style.removeProperty('transition-duration');
    node.classList.remove(SlideType.HIDDEN);
    ['in', 'out'].forEach(dir => {
      node.classList.remove(
        ...Object.values(Transition).map(name => `${name}-${dir}`)
      );
      ['left', 'right', 'up', 'down'].forEach(side => {
        node.classList.remove(`${Transition.SLIDE}-${dir}-${side}`);
      });
    });
  };

  const clearAll = async (panel: NotebookPanel) => {
    miscStyles(panel, false);
    layout.forEach(slide => {
      customStyle(slide, false);
    });
    await getCells(panel).then(cells => {
      cells.forEach(cell => {
        clearStyles(cell.node);
        cell.node.classList.remove('hide-code');
      });
    });
  };
};

export default plugin;
