import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';

/** Scroll-reveal: fades/slides an element in the first time it enters the viewport.
 *  Styling lives in styles.scss ([data-reveal] / .is-visible). Respects reduced-motion.
 *
 *  Usage: <div reveal></div>  or  <div reveal [revealDelay]="80"></div>
 */
@Directive({
  selector: '[reveal]',
  standalone: true,
})
export class RevealDirective implements OnInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  /** Stagger delay in ms (e.g. index * 40 for lists). */
  @Input() revealDelay = 0;

  ngOnInit(): void {
    const el = this.host.nativeElement;
    el.setAttribute('data-reveal', '');
    if (this.revealDelay) el.style.transitionDelay = `${this.revealDelay}ms`;

    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-visible');
            this.observer?.unobserve(el);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );
    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
