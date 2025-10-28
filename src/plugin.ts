import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { SlideType, Transition } from './slideStyle';

const plugin = (
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
  setting: ISettingRegistry | null
) => {
  const { commands } = app;
  console.log('App:');
  console.log(app);
  console.log('Tracker:');
  console.log(tracker);
  console.log('Setting:');
  console.log(setting);

  let slideToggle = false;
  let layout: any[] = [];
  let slides: any[] = [];
  let pageIndex = 0;
  let prevIndex = pageIndex;
  let cellIndicies: any = {};
  let cellNum = 0;
  let activeIndex = 0;

  const initSlideshow = (mode: 'first' | 'current' = 'first') => {
    slideToggle = true;
    layout = [];
    slides = [];
    pageIndex = 0;
    prevIndex = pageIndex;
    cellIndicies = {};
    cellNum = 0;
    activeIndex = 0;

    if (tracker.currentWidget) {
      const panel: NotebookPanel = tracker.currentWidget;
      miscStyles(panel);
      panel.context.ready.then(async () => {
        await getCells(panel).then(cells => {
          cellNum = cells.length;
          cells.forEach((cell, index) => {
            const slideType = cell.model.metadata.slideshow?.slide_type;
            const transition = cell.model.metadata.slideshow?.transition;

            if (slideType === SlideType.SLIDE) {
              cellIndicies[index] = true;
              layout.push({
                index: index,
                cell: cell,
                type: slideType,
                transition: transition,
                fragments: [],
                children: []
              });
            } else if (slideType === SlideType.SUBSLIDE) {
              cellIndicies[index] = true;
              if (layout.length === 0) {
                layout.push({
                  index: index,
                  cell: cell,
                  type: SlideType.SLIDE,
                  transition: transition,
                  fragments: [],
                  children: []
                });
              } else {
                layout.push({
                  index: index,
                  cell: cell,
                  type: slideType,
                  transition: transition,
                  fragments: [],
                  children: []
                });
              }
            } else if (slideType === SlideType.FRAGMENT) {
              cellIndicies[index] = true;
              if (layout.length === 0) {
                layout.push({
                  index: index,
                  cell: cell,
                  type: SlideType.SLIDE,
                  transition: transition,
                  fragments: [],
                  children: []
                });
              } else {
                const lastSlide = layout[layout.length - 1];
                lastSlide.fragments.push({
                  index: index,
                  cell: cell,
                  type: slideType,
                  transition: transition,
                  children: []
                });
              }
            } else if (!slideType) {
              if (layout.length === 0) {
                layout.push({
                  index: index,
                  cell: cell,
                  type: SlideType.SLIDE,
                  transition: transition,
                  fragments: [],
                  children: []
                });
              } else {
                const lastSlide = layout[layout.length - 1];
                if (lastSlide.fragments.length > 0) {
                  lastSlide.fragments[
                    lastSlide.fragments.length - 1
                  ].children.push({
                    index: index,
                    cell: cell
                  });
                } else {
                  lastSlide.children.push({
                    index: index,
                    cell: cell
                  });
                }
              }
            }
          });
          // const navRight = document.createElement("button");
          // navRight.className = "slideshow-nav-right";
          // navRight.textContent = "click me!!";
          // navRight.addEventListener("click", () => {
          //   if (pageIndex < layout.length-1) {
          //     pageIndex++;
          //     updateLayout(pageIndex, layout);
          //   }
          // });
          // panel.node.appendChild(navRight);
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
            panel.content.activeCellIndex = activeIndex;
          }
          prevIndex = pageIndex;
          // activate all fragments before activeIndex
          layout[pageIndex].fragments
            ?.filter((fragment: any) => fragment.index <= activeIndex)
            .forEach((fragment: any) => {
              updateStyle(fragment, true, true, false);
            });
        }
        initSlides(panel);
        initLayout(pageIndex);

        console.log(`Active Index: ${activeIndex}`);
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

  // go to next cell when shift+enter
  const navListener = (sender: any, command: any) => {
    console.log(sender, command);
    if (command.id === 'notebook:run-cell-and-select-next') {
      const prevActive = activeIndex;
      do {
        activeIndex++;
      } while (!cellIndicies[activeIndex] && activeIndex < cellNum - 1);
      let activeCell = layout.find(
        item =>
          item.index === activeIndex ||
          item.fragments?.some(
            (fragment: any) => fragment.index === activeIndex
          )
      );
      if (!activeCell) {
        activeIndex = prevActive;
        activeCell = layout.find(
          item =>
            item.index === activeIndex ||
            item.fragments?.some(
              (fragment: any) => fragment.index === activeIndex
            )
        );
      }

      prevIndex = pageIndex;
      pageIndex = layout.findIndex(item => item === activeCell);
      if (pageIndex === -1) {
        pageIndex = prevIndex;
      }

      if (activeCell.index !== activeIndex) {
        const fragment = activeCell.fragments.find(
          (item: any) => item.index === activeIndex
        );
        updateStyle(
          fragment,
          true,
          true,
          true,
          fragment.transition,
          fragment.cell.model.metadata.slideshow?.slide_dir
        );
      }
      updateLayout();
    }
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
    let prev_slide: any = null;
    for (let i = 0; i < layout.length; i++) {
      slides.push(document.createElement('div'));
    }
    layout.forEach((slide, index) => {
      slides[index].classList.add(SlideType.SLIDE);

      slide.cell.node.classList.add(`cell${slide.index}`);
      slides[index].appendChild(slide.cell.node);

      slide.children?.forEach((child: any) => {
        child.cell.node.classList.add(`cell${child.index}`);
        slides[index].appendChild(child.cell.node);
      });
      slide.fragments?.forEach((fragment: any) => {
        fragment.cell.node.classList.add(`cell${fragment.index}`);
        slides[index].appendChild(fragment.cell.node);
        fragment.children?.forEach((child: any) => {
          child.cell.node.classList.add(`cell${child.index}`);
          slides[index].appendChild(child.cell.node);
        });
      });
      if (!prev_slide) {
        panel.content.node.insertBefore(
          slides[index],
          panel.content.node.firstChild
        );
        prev_slide = slides[index];
      } else {
        panel.content.node.insertBefore(slides[index], prev_slide.nextSibling);
      }
    });

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
          console.log('Adding font size');
          console.log(window.getComputedStyle(child).fontSize);
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
    if (
      (event.key === ' ' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown') &&
      hiddenFragments.length > 0
    ) {
      updateStyle(
        hiddenFragments[0],
        true,
        true,
        true,
        hiddenFragments[0].transition,
        hiddenFragments[0].cell.model.metadata.slideshow?.slide_dir
      );
      return;
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
          layout[pageIndex].type === SlideType.SUBSLIDE
        );
        // stay on last slide
        if (
          pageIndex === layout.length - 1 &&
          layout[pageIndex].type === SlideType.SUBSLIDE
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
        } while (
          pageIndex > 0 &&
          layout[pageIndex].type === SlideType.SUBSLIDE
        );
        updateLayout(false);
      }
    } else if (event.key === 'ArrowDown') {
      if (
        pageIndex < layout.length - 1 &&
        layout[pageIndex + 1].type === SlideType.SUBSLIDE
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
      if (pageIndex > 0 && layout[pageIndex].type !== SlideType.SLIDE) {
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

    if (tracker.currentWidget) {
      const panel: NotebookPanel = tracker.currentWidget;
      clearAll(panel);
      slides.forEach(slide => {
        panel.content.node.removeChild(slide);
      });
      app.commands.commandExecuted.disconnect(navListener);
      document.removeEventListener('keydown', slideNav);
      document.removeEventListener('fullscreenchange', exitEvent);
    }
  };

  // clean up notebook layout for slideshow
  const miscStyles = (panel: NotebookPanel, start: boolean = true) => {
    if (start) {
      panel.content.addClass('slide-container');
      panel.toolbar.addClass(SlideType.HIDDEN);
      for (let i = 0; i < panel.content.node.children.length; i++) {
        panel.content.node.children.item(i)?.classList.add(SlideType.HIDDEN);
      }
      const footers = document.getElementsByClassName('jp-Notebook-footer');
      for (let i = 0; i < footers.length; i++) {
        footers.item(i)?.classList.add(SlideType.HIDDEN);
      }
    } else {
      panel.content.removeClass('slide-container');
      panel.toolbar.removeClass(SlideType.HIDDEN);
      for (let i = 0; i < panel.content.node.children.length; i++) {
        panel.content.node.children.item(i)?.classList.remove(SlideType.HIDDEN);
      }
      const footers = document.getElementsByClassName('jp-Notebook-footer');
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
    for (let i = 0; i < layout.length; i++) {
      clearStyles(slides[i], false);
      layout[i].fragments?.forEach((fragment: any) => {
        updateStyle(fragment, false, true);
      });
      updateStyle(layout[i], i === index);
    }
    slides[index].classList.add('focused');
  };

  const updateLayout = (forward: boolean = true) => {
    if (pageIndex !== prevIndex) {
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
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[pageIndex].type
        );
        updateStyle(
          layout[pageIndex],
          true,
          false,
          forward,
          layout[pageIndex].transition,
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[pageIndex].type
        );
      } else {
        updateStyle(
          layout[prevIndex],
          false,
          false,
          forward,
          layout[pageIndex].transition,
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[prevIndex].type
        );
        updateStyle(
          layout[pageIndex],
          true,
          false,
          forward,
          layout[pageIndex].transition,
          layout[pageIndex].cell.model.metadata.slideshow?.slide_dir,
          layout[prevIndex].type
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

  const updateStyle = (
    item: any,
    add: boolean = true, // slide is visible
    fragment: boolean = false, // to update a fragment separately
    forward: boolean = true, // nav direction is forward (" ", "ArrowRight", "ArrowDown")
    transition: string = '',
    slideDir: undefined | 'horizontal' | 'vertical' = undefined,
    slideType: string = '',
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
                slideDir ||
                  (slideType === SlideType.SUBSLIDE ? 'vertical' : 'horizontal')
              )
            );
          } else {
            item.cell.node.classList.add(`${transition}-in`);
          }
        }
        item.children?.forEach((child: any) => {
          updateStyle(
            child,
            add,
            fragment,
            forward,
            transition,
            slideDir,
            slideType,
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
                  slideDir ||
                    (slideType === SlideType.SUBSLIDE
                      ? 'vertical'
                      : 'horizontal')
                )
              );
            } else {
              slides[page].classList.add(`${transition}-in`);
            }
          }
        }
      }
      if (active && tracker.currentWidget) {
        activeIndex = item.index;
        const panel: NotebookPanel = tracker.currentWidget;
        panel.content.activeCellIndex = activeIndex;
      }
    } else {
      if (fragment) {
        if (visible && transition) {
          if (transition === Transition.SLIDE) {
            item.cell.node.classList.add(
              slideTrans(
                'out',
                forward,
                slideDir ||
                  (slideType === SlideType.SUBSLIDE ? 'vertical' : 'horizontal')
              )
            );
          } else {
            item.cell.node.classList.add(`${transition}-out`);
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
            slideDir,
            slideType,
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
                slideDir ||
                  (slideType === SlideType.SUBSLIDE ? 'vertical' : 'horizontal')
              )
            );
          } else {
            slides[page]?.classList.add(`${transition}-out`);
          }
        }
        slides[page]?.classList.add(SlideType.HIDDEN);
      }
      if (!forward && active) {
        do {
          activeIndex--;
        } while (activeIndex > 0 && !cellIndicies[activeIndex]);
        if (tracker.currentWidget) {
          if (!cellIndicies[activeIndex]) {
            activeIndex = layout[0].index;
          }
          const panel: NotebookPanel = tracker.currentWidget;
          panel.content.activeCellIndex = activeIndex;
        }
      }
    }
  };

  const clearStyles = (node: any, slideType: boolean = true) => {
    if (slideType) {
      node.classList.remove(...Object.values(SlideType));
    }
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
      });
    });
  };

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
};

export default plugin;
