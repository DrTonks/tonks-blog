// A completed entrance is remembered across Swup navigation. An interrupted one can retry.
let played = false;

export function createProfileSignature(delays: number[]): CustomElementConstructor {
  return class ProfileSignature extends HTMLElement {
    private observer?: IntersectionObserver;
    private animation?: Animation;
    private lifecycle?: AbortController;
    private visible = false;
    private preparing = false;

    connectedCallback() {
      this.lifecycle = new AbortController();
      const { signal } = this.lifecycle;
      this.visible = false;
      this.preparing = false;
      this.dataset.state = 'complete';
      if (played || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.dataset.state = 'pending';
      const sync = () => {
        if (signal.aborted || this.dataset.state === 'complete') return;
        if (this.animation) {
          if (this.canPlay()) this.animation.play();
          else this.animation.pause();
        } else if (this.canPlay() && !this.preparing) {
          void this.play(signal);
        }
      };
      document.addEventListener('visibilitychange', sync, { signal });
      const ready = () => {
        if (signal.aborted) return;
        this.observer = new IntersectionObserver((entries) => {
          if (signal.aborted || !entries.length) return;
          const entry = entries[entries.length - 1];
          this.visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
          sync();
        }, { threshold: [0, 0.5] });
        this.observer.observe(this);
      };
      const loader = document.getElementById('initial-loading-screen');
      if (loader && loader.dataset.complete !== 'true') {
        window.addEventListener('tonks:initial-loader:done', ready, { once: true, signal });
      } else ready();
    }

    private canPlay() {
      return this.visible && document.visibilityState === 'visible';
    }

    private complete() {
      this.dataset.state = 'complete';
      this.observer?.disconnect();
      this.animation?.cancel();
      this.animation = undefined;
      this.style.removeProperty('--signature-frames');
      this.lifecycle?.abort();
    }

    private async play(signal: AbortSignal) {
      const ink = this.querySelector<HTMLElement>('.signature-reveal');
      if (!ink) {
        this.complete();
        return;
      }
      this.preparing = true;
      try {
        const image = new Image();
        image.src = this.dataset.frames!;
        const stillImage = new Image();
        stillImage.src = this.dataset.still!;
        await Promise.all([image.decode(), stillImage.decode()]);
        if (signal.aborted) return;
        if (played || matchMedia('(prefers-reduced-motion: reduce)').matches) {
          this.complete();
          return;
        }
        // Decoding may finish after the user scrolls away or switches tabs.
        if (!this.canPlay()) return;
        this.style.setProperty('--signature-frames', `url("${image.src}")`);
        this.dataset.state = 'playing';
        const duration = delays.reduce((sum, delay) => sum + delay, 0);
        let elapsed = 0;
        const keyframes = delays.map((delay, index) => {
          const frame = {
            maskPosition: `${index / (delays.length - 1) * 100}% 0%`,
            offset: elapsed / duration,
            easing: 'steps(1, end)',
          };
          elapsed += delay;
          return frame;
        });
        keyframes.push({ maskPosition: '100% 0%', offset: 1, easing: 'steps(1, end)' });
        this.animation = ink.animate(keyframes, { duration, fill: 'forwards' });
        await this.animation.finished;
        if (!signal.aborted) {
          played = true;
          this.complete();
        }
      } catch {
        // Preserve a readable static signature if the asset or animation is unavailable.
        if (!signal.aborted) this.complete();
      } finally {
        if (!signal.aborted) this.preparing = false;
      }
    }

    disconnectedCallback() {
      this.lifecycle?.abort();
      this.observer?.disconnect();
      this.animation?.cancel();
      this.animation = undefined;
      this.style.removeProperty('--signature-frames');
    }
  };
}
