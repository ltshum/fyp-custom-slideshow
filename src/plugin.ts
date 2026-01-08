import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PLUGIN_ID, SlideType, Transition } from './constants';
import { Cell, Slide, Subslide, Fragment } from './slideType';

const plugin = (
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
  settings: ISettingRegistry
) => {
  const { commands } = app;
  console.log('App:');
  console.log(app);
  console.log('Tracker:');
  console.log(tracker);
  console.log('Settings:');
  console.log(settings);

  let panel: NotebookPanel;
  let windowedPanel: HTMLElement;
  let windowingMode: 'defer' | 'full' | 'none';

  let slideToggle = false;
  let layout: any[] = [];
  let slides: any[] = [];
  let pageIndex = 0;
  let prevIndex = pageIndex;
  let cellIndicies: any = {};
  let activeIndex = 0;
  let navPrevActive = activeIndex;

  // settings
  const loadSettings = (setting: any) => {
    return {
      dummy: setting.get('dummy').composite as boolean
    };
  };

  Promise.all([app.restored, settings.load(PLUGIN_ID)]).then(
    ([, settingRes]) => {
      let setting = loadSettings(settingRes);
      // update settings
      settingRes.changed.connect(() => {
        console.log('custom-slideshow settings updated:');
        setting = loadSettings(settingRes);
        console.log(setting);
      });

      // main menu commands
      commands.addCommand('slideshow:start-first', {
        label: 'Start from first cell',
        isEnabled: () => !slideToggle,
        execute: async () => {
          try {
            initSlideshow();
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
            initSlideshow('current');
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
            exitSlideshow();
          } catch (e) {
            console.error('Error exiting slideshow:');
            console.error(e);
          }
        }
      });
    }
  );

  const initSlideshow = (mode: 'first' | 'current' = 'first') => {
    slideToggle = true;
    layout = [];
    slides = [];
    pageIndex = 0;
    prevIndex = pageIndex;
    cellIndicies = {};
    activeIndex = 0;

    if (tracker.currentWidget) {
      panel = tracker.currentWidget;
      panel.context.ready.then(async () => {
        miscStyles(panel);
        panel.content.activeCellChanged.connect(activeListener);
        await getCells(panel).then(cells => {
          cells.forEach((cell, index) => {
            const slideType = cell.model.metadata.slideshow?.slide_type;
            const transition = cell.model.metadata.slideshow?.transition;

            switch (slideType) {
              case SlideType.SLIDE: {
                cellIndicies[index] = true;
                layout.push(new Slide(index, cell, transition));
                break;
              }
              case SlideType.SUBSLIDE: {
                cellIndicies[index] = true;
                layout.push(
                  layout.length === 0
                    ? new Slide(index, cell, transition)
                    : new Subslide(index, cell, transition)
                );
                break;
              }
              case SlideType.FRAGMENT: {
                cellIndicies[index] = true;
                if (layout.length === 0) {
                  layout.push(new Slide(index, cell, transition));
                } else {
                  // add to last slide
                  layout[layout.length - 1].fragments.push(
                    new Fragment(index, cell, transition)
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
                  layout.push(new Slide(index, cell, transition));
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
        });

        if (mode === 'first') {
          // start from first cell
          pageIndex = 0;
          prevIndex = pageIndex;
          activeIndex = layout[pageIndex].index;
        } else {
          // start from current cell
          activeIndex = panel.content.activeCellIndex;
          pageIndex = layout.findIndex(
            item =>
              item.index === activeIndex ||
              item.fragments?.some(
                (fragment: any) => fragment.index === activeIndex
              )
          );
          if (pageIndex === -1) {
            // activeIndex not in layout
            // find slide before activeIndex
            pageIndex = layout.findIndex(
              item =>
                item.index > activeIndex ||
                item.fragments?.some(
                  (fragment: any) => fragment.index > activeIndex
                )
            );
            if (pageIndex > 0 && layout[pageIndex].index > activeIndex) {
              pageIndex--;
            }
            if (pageIndex < 0) {
              pageIndex = 0;
            }
            // find if activeIndex is child of a fragment
            const activeFrag = layout[pageIndex].fragments?.find(
              (fragment: any) => {
                return fragment.children.some(
                  (child: any) => child.index === activeIndex
                );
              }
            );
            if (activeFrag) {
              activeIndex = activeFrag.index;
            } else {
              activeIndex = layout[pageIndex].index;
            }
            navPrevActive = activeIndex;
            panel.content.activeCellIndex = activeIndex;
          }
          prevIndex = pageIndex;
        }
        initSlides(panel);
        initLayout(pageIndex);

        // const navRight = document.createElement("button");
        // navRight.className = "slide-nav-right";
        // navRight.textContent = "click me!!";
        // navRight.addEventListener("click", () => {
        //   let presenterWindow = window.open('', '_blank', 'width=600,height=400');
        //   presenterWindow?.document.writeln('<html><head><title>Presenter View</title></head><body><h1>Presenter View</h1></body></html>');
        // });
        // panel.content.node.appendChild(navRight);

        app.commands.commandExecuted.connect(navListener);
        document.addEventListener('keydown', slideNav);
        document.addEventListener('fullscreenchange', exitEvent);
        await panel.content.node.requestFullscreen();
      });
    }
  };

  const exitEvent = () => {
    if (!document.fullscreenElement) {
      exitSlideshow();
    }
  };

  const activeListener = (args: any) => {
    activeIndex = panel.content.activeCellIndex;
  };

  const navListener = (sender: any, command: any) => {
    console.log(sender, command);
    // avoid overlap with normal navigation
    // note: command is fired after plugin listener
    if (
      command.id === 'notebook:move-cursor-up' ||
      command.id === 'notebook:move-cursor-down'
    ) {
      panel.content.activeCellIndex = navPrevActive;
    }
    // activate next cell when shift+enter
    else if (command.id === 'notebook:run-cell-and-select-next') {
      slideNav(new KeyboardEvent('keydown', { key: ' ' }));
    }
  };

  const addToSlide = (item: any, slide: any) => {
    item.cell.node.classList.add(`cell${item.index}`);
    if (
      item.cell.model.type === 'code' &&
      item.cell.model.metadata.slideshow?.hide_code
    ) {
      item.cell.node.classList.add('hide-code');
    }
    slide.appendChild(item.cell.node);
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
  const initSlides = (panel: NotebookPanel) => {
    for (let i = 0; i < layout.length; i++) {
      slides.push(document.createElement('div'));
    }
    layout.forEach((slide, index) => {
      slides[index].classList.add(SlideType.SLIDE);

      addToSlide(slide, slides[index]);
      slide.children?.forEach((child: any) => {
        addToSlide(child, slides[index]);
      });
      slide.fragments?.forEach((fragment: any) => {
        addToSlide(fragment, slides[index]);
        fragment.children?.forEach((child: any) => {
          addToSlide(child, slides[index]);
        });
      });
    });

    for (let i = slides.length - 1; i >= 0; i--) {
      panel.content.node.insertBefore(slides[i], panel.content.node.firstChild);
    }

    layout.forEach(slide => {
      customStyle(slide);
    });
  };

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

  const slideNav = (event: KeyboardEvent) => {
    const navKeyList = [
      ' ',
      'ArrowRight',
      'ArrowLeft',
      'ArrowDown',
      'ArrowUp',
      'Escape'
    ];
    /* 
    space: every active cell
    left/right: prev/next slide
    up/down: prev/next subslide
    esc: exit
    */
    if (!navKeyList.includes(event.key)) {
      return;
    }
    // editing cells
    if (
      document.querySelectorAll('.slide-container.jp-mod-editMode').length > 0
    ) {
      return;
    }

    prevIndex = pageIndex;

    // navigate fragments first
    const fragments = layout[pageIndex].fragments;
    const hiddenFragments = fragments.filter((item: any) =>
      item.cell.node.classList.contains(SlideType.HIDDEN)
    );
    const visibleFragments = fragments.filter((item: any) =>
      item.cell.node.classList.contains(SlideType.VISIBLE)
    );
    const iterFragments = visibleFragments.filter(
      (item: any) => item.index > activeIndex
    );
    if (
      (event.key === ' ' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown') &&
      (hiddenFragments.length > 0 || iterFragments.length > 0)
    ) {
      if (iterFragments.length > 0) {
        updateStyle(iterFragments[0], true, true);
        return;
      }
      if (hiddenFragments.length > 0) {
        updateStyle(
          hiddenFragments[0],
          true,
          true,
          true,
          hiddenFragments[0].transition,
          hiddenFragments[0].cell.model.metadata.slideshow?.transition_duration,
          hiddenFragments[0].cell.model.metadata.slideshow?.slide_dir
        );
        return;
      }
    }
    if (
      (event.key === 'ArrowUp' || event.key === 'ArrowLeft') &&
      visibleFragments.length > 0
    ) {
      updateStyle(
        visibleFragments[visibleFragments.length - 1],
        false,
        true,
        false,
        visibleFragments[visibleFragments.length - 1].transition,
        visibleFragments[visibleFragments.length - 1].cell.model.metadata
          .slideshow?.transition_duration,
        visibleFragments[visibleFragments.length - 1].cell.model.metadata
          .slideshow?.slide_dir
      );
      return;
    }

    if (event.key === ' ') {
      if (pageIndex < layout.length - 1) {
        pageIndex++;
        updateLayout();
      }
    }
    if (event.key === 'ArrowRight') {
      if (pageIndex < layout.length - 1) {
        do {
          pageIndex++;
        } while (
          pageIndex < layout.length - 1 &&
          layout[pageIndex] instanceof Subslide
        );
        // stay on last slide
        if (
          pageIndex === layout.length - 1 &&
          layout[pageIndex] instanceof Subslide
        ) {
          pageIndex = prevIndex;
        }
        const nextHiddenFragments = layout[pageIndex].fragments.filter(
          (item: any) => item.cell.node.classList.contains(SlideType.HIDDEN)
        );
        if (nextHiddenFragments.length > 0) {
          nextHiddenFragments.forEach((fragment: any) => {
            updateStyle(fragment, false, true);
          });
        }
        updateLayout();
      }
    } else if (event.key === 'ArrowLeft') {
      if (pageIndex > 0) {
        do {
          pageIndex--;
        } while (pageIndex > 0 && layout[pageIndex] instanceof Subslide);
        updateLayout(false);
      }
    } else if (event.key === 'ArrowDown') {
      if (
        pageIndex < layout.length - 1 &&
        layout[pageIndex + 1] instanceof Subslide
      ) {
        pageIndex++;
        const nextHiddenFragments = layout[pageIndex].fragments.filter(
          (item: any) => item.cell.node.classList.contains(SlideType.HIDDEN)
        );
        if (nextHiddenFragments.length > 0) {
          nextHiddenFragments.forEach((fragment: any) => {
            updateStyle(fragment, false, true);
          });
        }
        updateLayout();
      }
    } else if (event.key === 'ArrowUp') {
      if (pageIndex > 0 && !(layout[pageIndex] instanceof Slide)) {
        pageIndex--;
        updateLayout(false);
      }
    } else if (event.key === 'Escape') {
      exitSlideshow();
      return;
    }
    console.log('Indices:');
    console.log(cellIndicies);
    console.log(activeIndex);
    console.log('Page index:');
    console.log(pageIndex);
  };

  const exitSlideshow = async () => {
    slideToggle = false;
    panel.content.activeCellChanged.disconnect(activeListener);
    clearAll(panel);
    slides.forEach(slide => {
      panel.content.node.removeChild(slide);
    });
    app.commands.commandExecuted.disconnect(navListener);
    document.removeEventListener('keydown', slideNav);
    document.removeEventListener('fullscreenchange', exitEvent);
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

      for (let i = 0; i < panel.content.node.children.length; i++) {
        panel.content.node.children.item(i)?.classList.add(SlideType.HIDDEN);
      }
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

  const initLayout = (index: number = 0) => {
    // TODO: refactor style-related functions so that activeIndex doesn't change here
    const active = activeIndex;
    for (let i = 0; i < layout.length; i++) {
      clearStyles(slides[i], false);
      layout[i].fragments?.forEach((fragment: any) => {
        updateStyle(fragment, false, true);
      });
      updateStyle(layout[i], i === index);
    }
    // activate every fragment in current page before activeIndex
    layout[index].fragments
      ?.filter((fragment: any) => fragment.index <= active)
      .forEach((fragment: any) => {
        updateStyle(fragment, true, true);
      });
    slides[index].classList.add('focused');
  };

  const updateLayout = (forward: boolean = true) => {
    console.log(`prevIndex: ${prevIndex}, pageIndex: ${pageIndex}`);
    if (pageIndex !== prevIndex) {
      // reset view from possible overflow on prev page
      slides[pageIndex].scrollIntoView();
      clearStyles(slides[prevIndex], false);
      clearStyles(slides[pageIndex], false);
      slides[prevIndex].classList.remove('focused');
      slides[pageIndex].classList.add('focused');
      if (forward) {
        updateStyle(
          layout[prevIndex],
          false,
          false,
          forward,
          layout[pageIndex].transition,
          layout[pageIndex].cell.model.metadata.slideshow?.transition_duration,
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[pageIndex] instanceof Subslide
        );
        updateStyle(
          layout[pageIndex],
          true,
          false,
          forward,
          layout[pageIndex].transition,
          layout[pageIndex].cell.model.metadata.slideshow?.transition_duration,
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[pageIndex] instanceof Subslide
        );
      } else {
        updateStyle(
          layout[prevIndex],
          false,
          false,
          forward,
          layout[pageIndex].transition,
          layout[pageIndex].cell.model.metadata.slideshow?.transition_duration,
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[prevIndex] instanceof Subslide
        );
        updateStyle(
          layout[pageIndex],
          true,
          false,
          forward,
          layout[pageIndex].transition,
          layout[pageIndex].cell.model.metadata.slideshow?.transition_duration,
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[prevIndex] instanceof Subslide
        );
      }
    }
  };

  const slideTrans = (
    dir: 'in' | 'out',
    forward: boolean = true,
    axis: 'horizontal' | 'vertical' = 'horizontal'
  ) => {
    return forward
      ? `${Transition.SLIDE}-${dir}-${axis === 'vertical' ? 'up' : 'left'}`
      : `${Transition.SLIDE}-${dir}-${axis === 'vertical' ? 'down' : 'right'}`;
  };

  const updateStyle = async (
    item: any,
    add: boolean = true, // slide is visible
    fragment: boolean = false, // to update a fragment separately
    forward: boolean = true, // nav direction is forward (" ", "ArrowRight", "ArrowDown")
    transition: string = '',
    transition_duration: number = 1,
    slideDir: undefined | 'horizontal' | 'vertical' = undefined,
    isSubslide: boolean = false,
    visible: boolean = true, // fragment is visible
    active: boolean = true // cell has slide type and thus can be active
  ) => {
    clearStyles(item.cell.node, false);
    if (add) {
      if (fragment) {
        item.cell.node.classList.add(SlideType.VISIBLE);
        if (transition) {
          if (transition === Transition.SLIDE) {
            item.cell.node.classList.add(
              slideTrans(
                'in',
                forward,
                slideDir || (isSubslide ? 'vertical' : 'horizontal')
              )
            );
          } else {
            item.cell.node.classList.add(`${transition}-in`);
          }
          if (transition_duration !== undefined) {
            item.cell.node.style.animationDuration = `${transition_duration}s`;
          }
        }
        item.children?.forEach((child: any) => {
          updateStyle(
            child,
            add,
            fragment,
            forward,
            transition,
            transition_duration,
            slideDir,
            isSubslide,
            visible,
            false
          );
        });
      } else {
        if (transition) {
          const page = layout.findIndex(slide => slide.index === item.index);
          if (page !== -1) {
            if (transition === Transition.SLIDE) {
              slides[page].classList.add(
                slideTrans(
                  'in',
                  forward,
                  slideDir || (isSubslide ? 'vertical' : 'horizontal')
                )
              );
            } else {
              slides[page].classList.add(`${transition}-in`);
            }
            if (transition_duration !== undefined) {
              slides[page].style.animationDuration = `${transition_duration}s`;
            }
          }
        }
      }
      const tempActive = activeIndex;
      activeIndex = item.index;
      navPrevActive = activeIndex;
      panel.content.activeCellIndex = activeIndex;
      item.fragments?.forEach((frag: any) => {
        updateStyle(
          frag,
          frag.index <= tempActive,
          true,
          false,
          '',
          undefined,
          undefined,
          false,
          frag.index <= tempActive,
          frag.index <= tempActive
        );
      });
    } else {
      if (fragment) {
        if (visible && transition) {
          if (transition === Transition.SLIDE) {
            item.cell.node.classList.add(
              slideTrans(
                'out',
                forward,
                slideDir || (isSubslide ? 'vertical' : 'horizontal')
              )
            );
          } else {
            item.cell.node.classList.add(`${transition}-out`);
          }
          if (transition_duration !== undefined) {
            item.cell.node.style.animationDuration = `${transition_duration}s`;
          }
        }
        item.cell.node.classList.remove(SlideType.VISIBLE);
        item.cell.node.classList.add(SlideType.HIDDEN);
        item.children?.forEach((child: any) => {
          updateStyle(
            child,
            add,
            fragment,
            forward,
            transition,
            transition_duration,
            slideDir,
            isSubslide,
            visible,
            false
          );
        });
      } else {
        const page = layout.findIndex(slide => slide.index === item.index);
        if (transition) {
          if (transition === Transition.SLIDE) {
            slides[page]?.classList.add(
              slideTrans(
                'out',
                forward,
                slideDir || (isSubslide ? 'vertical' : 'horizontal')
              )
            );
          } else {
            slides[page]?.classList.add(`${transition}-out`);
          }
          if (transition_duration !== undefined) {
            slides[page].style.animationDuration = `${transition_duration}s`;
          }
        }
        slides[page]?.classList.add(SlideType.HIDDEN);
      }
      if (!forward && active) {
        do {
          activeIndex--;
        } while (activeIndex > 0 && !cellIndicies[activeIndex]);
        if (!cellIndicies[activeIndex]) {
          activeIndex = layout[0].index;
        }
        navPrevActive = activeIndex;
        panel.content.activeCellIndex = activeIndex;
      }
      const tempActive = activeIndex;
      item.fragments?.forEach((frag: any) => {
        updateStyle(
          frag,
          frag.index <= tempActive,
          frag.index > tempActive,
          false,
          '',
          undefined,
          undefined,
          false,
          frag.index <= tempActive,
          frag.index <= tempActive
        );
      });
    }
  };

  const clearStyles = (node: any, slideType: boolean = true) => {
    if (slideType) {
      node.classList.remove(...Object.values(SlideType));
    }
    node.style.removeProperty('animation-duration');
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
