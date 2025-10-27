import {
  JupyterFrontEnd
} from '@jupyterlab/application';
import {
  INotebookTracker,
  NotebookPanel
} from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { SlideType, Transition } from './slideStyle';

const plugin = (app: JupyterFrontEnd, tracker: INotebookTracker, setting: ISettingRegistry | null) => {

  const { commands } = app;
  console.log("App:");
  console.log(app);
  console.log("Tracker:");
  console.log(tracker);
  console.log("Setting:");
  console.log(setting);

  let slideToggle = false;
  let layout: any[] = [];
  let slides: any[] = [];
  let pageIndex = 0;
  let prevIndex = pageIndex;
  let cellIndicies: any = {};
  let cellNum = 0;
  let activeIndex = 0;

  const initSlide = (mode: "first" | "current" = "first") => {
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
        await getCells(panel).then((cells) => {
          cellNum = cells.length;
          cells.forEach((cell, index) => {
            const slideType = cell.model.metadata.slideshow?.slide_type;
            const transition = cell.model.metadata.slideshow?.transition;
            // cell.node.classList.add(SlideType.HIDDEN);
            // if (slideType) {
            //   cell.node.classList.add(slideType);
            // }

            if (slideType === SlideType.SLIDE) {
              cellIndicies[index] = true;
              layout.push({
                index: index,
                cell: cell, 
                type: slideType, 
                transition: transition,
                fragments: []
              });
            }
            else if (slideType === SlideType.SUBSLIDE) {
              cellIndicies[index] = true;
              if (layout.length === 0) {
                layout.push({
                  index: index,
                  cell: cell, 
                  type: SlideType.SLIDE, 
                  transition: transition,
                  fragments: []
                });
              }
              else {
                layout.push({
                  index: index,
                  cell: cell, 
                  type: slideType,
                  transition: transition, 
                  fragments: []
                });
              }
            }
            else if (slideType === SlideType.FRAGMENT) {
              cellIndicies[index] = true;
              if (layout.length === 0) {
                layout.push({
                  index: index,
                  cell: cell, 
                  type: SlideType.SLIDE,
                  transition: transition,
                  fragments: []
                });
              }
              else {
                let lastSlide = layout[layout.length - 1];
                lastSlide.fragments.push({
                  index: index,
                  cell: cell, 
                  type: slideType,
                  transition: transition
                });
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

        if (mode === "first") {
          pageIndex = 0;
          prevIndex = pageIndex;
          activeIndex = layout[pageIndex].index;
        }
        else {
          activeIndex = panel.content.activeCellIndex;
          pageIndex = layout.findIndex(
            (item) => item.index === activeIndex
            || item.fragments?.some((fragment: any) => fragment.index === activeIndex)
          );
          if (pageIndex === -1) {
            pageIndex = 0;
            activeIndex = layout[pageIndex].index;
            panel.content.activeCellIndex = activeIndex;
          }
          prevIndex = pageIndex;
          layout[pageIndex].fragments?.filter((fragment: any) => fragment.index <= activeIndex)
          .forEach((fragment: any) => {
            updateStyle(fragment, true, true, false);
          });
        }
        initLayout(pageIndex);
        initSlides(panel);

        console.log(`Active Index: ${activeIndex}`);
        app.commands.commandExecuted.connect(navListener);
        document.addEventListener("keydown", slideNav);
        document.addEventListener('fullscreenchange', exitEvent);
        await panel.content.node.requestFullscreen();
      });
    }
  };

  const exitEvent = () => {
    if (!document.fullscreenElement) {
      exitSlide();
    }
  }

  const navListener = (sender: any, command: any) => {
    console.log(sender, command);
    if (command.id === "notebook:run-cell-and-select-next") {
      console.log("Run cell command detected");
      let prevActive = activeIndex;
      do {
        activeIndex++;
      } while (!cellIndicies[activeIndex] && activeIndex < cellNum-1);
      let activeCell = layout.find((item) => item.index === activeIndex
        || item.fragments?.some((fragment: any) => fragment.index === activeIndex)
      );
      if (!activeCell) {
        activeIndex = prevActive;
        activeCell = layout.find((item) => item.index === activeIndex
          || item.fragments?.some((fragment: any) => fragment.index === activeIndex)
        );
      }

      prevIndex = pageIndex;
      pageIndex = layout.findIndex((item) => item === activeCell);
      if (pageIndex === -1) {
        pageIndex = prevIndex;
      }

      if (activeCell.index !== activeIndex) {
        const fragment = activeCell.fragments.find((item: any) => item.index === activeIndex);
        updateStyle(fragment, true, true, true, fragment.transition);
      }
      updateLayout();
    }
  }

  const initSlides = (panel: NotebookPanel) => {
    let prev_slide: any = null;
    for (let i = 0; i < layout.length; i++) {
      slides.push(document.createElement("div"));
    }
    layout.forEach((slide, index) => {
      slides[index].className = slide.type;
      slides[index].appendChild(slide.cell.node);
      slide.fragments?.forEach((fragment: any) => {
        slides[index].appendChild(fragment.cell.node);
      });
      if (!prev_slide) {
        panel.content.node.insertBefore(slides[index], panel.content.node.firstChild);
        prev_slide = slides[index];
      }
      else {
        panel.content.node.insertBefore(slides[index], prev_slide.nextSibling);
      }
    });
  };

  const slideNav = (event: KeyboardEvent) => {
    const navKeyList = [" ", "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Escape"];
    if (!navKeyList.includes(event.key)) {
      return;
    }
    prevIndex = pageIndex;
    const fragments = layout[pageIndex].fragments;
    const hiddenFragments = fragments.filter((item: any) => item.cell.node.classList.contains(SlideType.HIDDEN));
    const visibleFragments = fragments.filter((item: any) => item.cell.node.classList.contains(SlideType.VISIBLE));
    if ((event.key === " "
      || event.key === "ArrowRight"
      || event.key === "ArrowDown")
      && hiddenFragments.length > 0
    ) {
      updateStyle(hiddenFragments[0], true, true, true, hiddenFragments[0].transition);
      return;
    }
    if ((event.key === "ArrowUp"
      || event.key === "ArrowLeft")
      && visibleFragments.length > 0
    ) {
      updateStyle(visibleFragments[visibleFragments.length-1], false, true, false, visibleFragments[0].transition);
      return;
    }

    if (event.key === " ") {
      if (pageIndex < layout.length-1) {
        pageIndex++;
        updateLayout();
      }
    }
    if (event.key === "ArrowRight") {
      if (pageIndex < layout.length-1) {
        do {
          pageIndex++;
        }
        while (pageIndex < layout.length-1 && layout[pageIndex].type === SlideType.SUBSLIDE);
        // stay on last slide
        if (pageIndex === layout.length-1 && layout[pageIndex].type === SlideType.SUBSLIDE) {
          pageIndex = prevIndex;
        }
        const nextHiddenFragments = layout[pageIndex].fragments
        .filter((item: any) => item.cell.node.classList.contains(SlideType.HIDDEN));
        if (nextHiddenFragments.length > 0) {
          nextHiddenFragments.forEach((fragment: any) => {
            updateStyle(fragment, false, true);
          });
        }
        updateLayout();
      }
    }
    else if (event.key === "ArrowLeft") {
      if (pageIndex > 0) {
        do {
          pageIndex--;
        }
        while (pageIndex > 0 && layout[pageIndex].type === SlideType.SUBSLIDE);
        updateLayout(false);
      }
    }
    else if (event.key === "ArrowDown") {
      if (pageIndex < layout.length-1 && layout[pageIndex+1].type === SlideType.SUBSLIDE) {
        pageIndex++;
        const nextHiddenFragments = layout[pageIndex].fragments
        .filter((item: any) => item.cell.node.classList.contains(SlideType.HIDDEN));
        if (nextHiddenFragments.length > 0) {
          nextHiddenFragments.forEach((fragment: any) => {
            updateStyle(fragment, false, true);
          });
        }
        updateLayout();
      }
    }
    else if (event.key === "ArrowUp") {
      if (pageIndex > 0 && layout[pageIndex].type !== SlideType.SLIDE) {
        pageIndex--;
        updateLayout(false);
      }
    }
    else if (event.key === "Escape") {
      exitSlide();
      return;
    }
    console.log("Indices:");
    console.log(cellIndicies);
    console.log(activeIndex);
    console.log("Page index:");
    console.log(pageIndex);
  };

  const exitSlide = async () => {
    slideToggle = false;

    if (tracker.currentWidget) {
      const panel: NotebookPanel = tracker.currentWidget;
      try {
        slides.forEach((slide) => {
          panel.content.node.removeChild(slide);
        });
      }
      catch (error) {
        console.error("Error removing slides:");
        console.error(error);
      }
      clearAll(panel);
      app.commands.commandExecuted.disconnect(navListener);
      document.removeEventListener("keydown", slideNav);
      document.removeEventListener('fullscreenchange', exitEvent);
    }
  }

  const miscStyles = (panel: NotebookPanel, start: boolean = true) => {
    if (start) {
      panel.content.addClass("slide-container");
      panel.toolbar.addClass(SlideType.HIDDEN);
      document.querySelector(".jp-WindowedPanel-outer")?.classList.add("slide-scroll");
      for (let i = 0; i < panel.content.node.children.length; i++) {
        panel.content.node.children.item(i)?.classList.add(SlideType.HIDDEN);
      };
      const footers = document.getElementsByClassName("jp-Notebook-footer");
      for (let i = 0; i < footers.length; i++) {
        footers.item(i)?.classList.add(SlideType.HIDDEN);
      }
/*       const cellToolbars = document.getElementsByClassName("jp-cell-toolbar");
      for (let i = 0; i < cellToolbars.length; i++) {
        cellToolbars.item(i)?.classList.add(SlideType.HIDDEN);
      } */
    }
    else {
      panel.content.removeClass("slide-container");
      panel.toolbar.removeClass(SlideType.HIDDEN);
      document.querySelector(".jp-WindowedPanel-outer")?.classList.remove("slide-scroll");
      for (let i = 0; i < panel.content.node.children.length; i++) {
        panel.content.node.children.item(i)?.classList.remove(SlideType.HIDDEN);
      };
      const footers = document.getElementsByClassName("jp-Notebook-footer");
      for (let i = 0; i < footers.length; i++) {
        footers.item(i)?.classList.remove(SlideType.HIDDEN);
      }
/*       const cellToolbars = document.getElementsByClassName("jp-cell-toolbar");
      for (let i = 0; i < cellToolbars.length; i++) {
        cellToolbars.item(i)?.classList.remove(SlideType.HIDDEN);
      } */
    }
  }

  const getCells = async (panel: NotebookPanel) => {
    let cells: any[] = [];
    await panel.context.ready;
    await Promise.all(
      panel.content.widgets.map(cell => cell.ready)
    ).then(() => {
      cells = [...panel.content.widgets];
    });
    return cells;
  };

  const initLayout = (index: number = 0) => {
    for (let i = 0; i < layout.length; i++) {
      updateStyle(layout[i], i === index);
    }
  };

  const updateLayout = (forward: boolean = true) => {
    if (pageIndex !== prevIndex) {
      if (forward) {
        updateStyle(layout[prevIndex], false, false, forward, layout[pageIndex].transition, layout[pageIndex].type);
        updateStyle(layout[pageIndex], true, false, forward, layout[pageIndex].transition, layout[pageIndex].type);
      }
      else {
        updateStyle(layout[prevIndex], false, false, forward, layout[pageIndex].transition, layout[prevIndex].type);
        updateStyle(layout[pageIndex], true, false, forward, layout[pageIndex].transition, layout[prevIndex].type);
      }
    }
  };

  const updateStyle = (
    item: any, 
    add: boolean = true, 
    fragment: boolean = false, 
    forward: boolean = true,
    transition: string = "",
    slideType: string = ""
  ) => {
    console.log("clear");
    clearStyles(item.cell, false);
    if (add) {
      if (transition) {
        if (transition === Transition.SLIDE) {
          if (forward) {
            /* 
            forward, !subslide = left
            forward, subslide = up
            !forward, !subslide = right
            !forward, subslide = down
            */
            item.cell.node.classList.add(`${transition}-in-${slideType === SlideType.SUBSLIDE ? "up" : "left"}`);
          }
          else {
            item.cell.node.classList.add(`${transition}-in-${slideType === SlideType.SUBSLIDE ? "down" : "right"}`);
          }
        }
        else {
          item.cell.node.classList.add(`${transition}-in`);
        }
      }
      if (fragment) {
        item.cell.node.classList.add(SlideType.VISIBLE);
      }
      if (tracker.currentWidget) {
        console.log(`Current item: ${item.index}`);
        activeIndex = item.index;
        console.log(`Update active: ${activeIndex}`);
        const panel: NotebookPanel = tracker.currentWidget;
        panel.content.activeCellIndex = activeIndex;
      }
    }
    else {
      // fragments don't have exit animation, you can only go back to prev slide when there's one main slide on screen
      if (!(item.type === SlideType.FRAGMENT) && transition) {
        if (transition === Transition.SLIDE) {
          if (forward) {
            /* 
            forward, !subslide = left
            forward, subslide = up
            !forward, !subslide = right
            !forward, subslide = down
            */
            item.cell.node.classList.add(`${transition}-out-${slideType === SlideType.SUBSLIDE ? "up" : "left"}`);
          }
          else {
            item.cell.node.classList.add(`${transition}-out-${slideType === SlideType.SUBSLIDE ? "down" : "right"}`);
          }
        }
        else {
          item.cell.node.classList.add(`${transition}-out`);
        }
      }
      item.cell.node.classList.add(SlideType.HIDDEN);
      if (fragment) {
        item.cell.node.classList.remove(SlideType.VISIBLE);
      }
      if (!forward) {
        do {
          activeIndex--;
          console.log(`Decrement active index: ${activeIndex}`);
        } while (activeIndex > 0 && !cellIndicies[activeIndex]);
        if (tracker.currentWidget) {
          if (!cellIndicies[activeIndex]) {
            activeIndex = layout[0].index;
          }
          console.log(`Current item: ${item.index}`);
          console.log(`Update active: ${activeIndex}`);
          const panel: NotebookPanel = tracker.currentWidget;
          panel.content.activeCellIndex = activeIndex;
        }
      }
    }
    item.fragments?.forEach((fragment: any) => {
      console.log(`Update fragment: ${fragment.index}`);
      updateStyle(
        fragment, 
        add ? fragment.cell.node.classList.contains(SlideType.VISIBLE) : false, 
        false, 
        forward,
        transition,
        slideType
      );
    });
  };

  const clearStyles = (cell: any, slideType: boolean = true) => {
    if (slideType) {
      cell.node.classList.remove(...Object.values(SlideType));
    }
    cell.node.classList.remove(SlideType.HIDDEN);
    ["in", "out"].forEach((dir) => {
      cell.node.classList.remove(...Object.values(Transition).map((name) => `${name}-${dir}`));
      ["left", "right", "up", "down"].forEach((side) => {
        cell.node.classList.remove(`${Transition.SLIDE}-${dir}-${side}`);
      });
    });
  }

  const clearAll = async (panel: NotebookPanel) => {
    miscStyles(panel, false);
    await getCells(panel).then((cells) => {
      cells.forEach((cell) => {
        clearStyles(cell);
      });
    });
  };

  commands.addCommand("slideshow:view-first", {
    label: "Start from first cell",
    isEnabled: () => !slideToggle,
    execute: async () => {
      initSlide();
    }
  });

  commands.addCommand("slideshow:view-current", {
    label: "Start from current cell",
    isEnabled: () => !slideToggle,
    execute: () => {
      initSlide("current");
    }
  });

  commands.addCommand("slideshow:exit", {
    label: "Exit slideshow",
    isEnabled: () => slideToggle,
    execute: () => {
      exitSlide();
    }
  });


}

export default plugin;