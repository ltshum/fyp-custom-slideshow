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
  fragments: any[];
  children: any[];

  constructor(index: number, cell: any, transition: string) {
    super(index, cell);
    this.transition = transition;
    this.fragments = [];
    this.children = [];
  }
}

class Subslide extends Cell {
  transition: string;
  fragments: any[];
  children: any[];

  constructor(index: number, cell: any, transition: string) {
    super(index, cell);
    this.transition = transition;
    this.fragments = [];
    this.children = [];
  }
}

class Fragment extends Cell {
  transition: string;
  children: any[];

  constructor(index: number, cell: any, transition: string) {
    super(index, cell);
    this.transition = transition;
    this.children = [];
  }
}

export { Cell, Slide, Subslide, Fragment };
