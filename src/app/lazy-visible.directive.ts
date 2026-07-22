import { Directive, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, inject } from '@angular/core';

/**
 * Emits `appLazyVisible` once, the first time the host element scrolls into view
 * (or immediately if IntersectionObserver is unavailable). Used to render PDF
 * page thumbnails on demand instead of all at once, so the split editor opens
 * instantly even for very large PDFs.
 */
@Directive({
  selector: '[appLazyVisible]',
  standalone: false
})
export class LazyVisibleDirective implements OnInit, OnDestroy {
  /** Scroll container used as the IntersectionObserver root (defaults to the viewport). */
  @Input() lazyRoot?: HTMLElement | null;
  /** How far outside the root to start loading, so thumbnails are ready before they scroll in. */
  @Input() lazyRootMargin = '400px';
  @Output() appLazyVisible = new EventEmitter<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private observer: IntersectionObserver | null = null;
  private emitted = false;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.emit();
      return;
    }
    this.observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          this.emit();
        }
      },
      { root: this.lazyRoot ?? null, rootMargin: this.lazyRootMargin, threshold: 0.01 }
    );
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private emit(): void {
    if (this.emitted) {
      return;
    }
    this.emitted = true;
    this.disconnect();
    // IntersectionObserver callbacks run outside Angular's zone; re-enter so the
    // consumer's change detection works as expected.
    this.zone.run(() => this.appLazyVisible.emit());
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
