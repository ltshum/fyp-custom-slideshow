const PLUGIN_ID = 'custom-slideshow:plugin';

enum SlideType {
  SLIDE = 'slide',
  SUBSLIDE = 'subslide',
  FRAGMENT = 'fragment',
  NOTES = 'notes',
  SKIP = 'skip',
  HIDDEN = 'hidden',
  VISIBLE = 'fragment-visible'
}

enum Transition {
  SLIDE = 'slide',
  FADE = 'fade',
  ZOOM = 'zoom'
}

export { PLUGIN_ID, SlideType, Transition };
