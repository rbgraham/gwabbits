import { Controller } from '../vendor/stimulus.js';

/* iOS large-title behaviour: the bar grows a hairline once content slides
   under it, so the title never floats ambiguously over the page. */

export default class extends Controller {
  connect() {
    this.onScroll = () => {
      this.element.dataset.scrolled = String(window.scrollY > 4);
    };
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.onScroll();
  }

  disconnect() {
    window.removeEventListener('scroll', this.onScroll);
  }
}
