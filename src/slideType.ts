class Cell {
  index: number;
  cell: any;

  constructor(index: number, cell: any) {
    this.index = index;
    this.cell = cell;
  }
}

class Slide extends Cell {
  transition: string;
  transitionOut: string;
  tansitionDuration: number;
  fragments: any[];
  children: any[];

  constructor(
    index: number,
    cell: any,
    transition: string,
    transitionOut: string,
    transitionDuration: number
  ) {
    super(index, cell);
    this.transition = transition;
    this.transitionOut = transitionOut;
    this.tansitionDuration = transitionDuration;
    this.fragments = [];
    this.children = [];
  }
}

class Subslide extends Cell {
  transition: string;
  transitionOut: string;
  trnsitionDuration: number;
  fragments: any[];
  children: any[];

  constructor(
    index: number,
    cell: any,
    transition: string,
    transitionOut: string,
    transitionDuration: number
  ) {
    super(index, cell);
    this.transition = transition;
    this.transitionOut = transitionOut;
    this.trnsitionDuration = transitionDuration;
    this.fragments = [];
    this.children = [];
  }
}

class Fragment extends Cell {
  transition: string;
  transitionDuration: number;
  children: any[];

  constructor(
    index: number,
    cell: any,
    transition: string,
    transitionDuration: number
  ) {
    super(index, cell);
    this.transition = transition;
    this.transitionDuration = transitionDuration;
    this.children = [];
  }
}

export { Cell, Slide, Subslide, Fragment };
