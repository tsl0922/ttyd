export type ModifierFlags = {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
};

export type VirtualKey = 'esc' | 'tab' | 'up' | 'down' | 'left' | 'right' | 'home' | 'end';

type ModifierKey = keyof ModifierFlags;

interface MobileKeysControllerOptions {
    opacity: number;
    scale: number;
    onClipboardAction: () => void;
    onSendVirtualKey: (key: VirtualKey, modifiers: ModifierFlags) => void;
}

const MODIFIER_KEYS: ModifierKey[] = ['ctrl', 'alt', 'shift'];

export class MobileKeysController {
    private root: HTMLDivElement;
    private panel: HTMLDivElement;
    private modifiers: ModifierFlags = { ctrl: false, alt: false, shift: false };
    private modifierButtons = new Map<ModifierKey, HTMLButtonElement>();
    private copyButton?: HTMLButtonElement;
    private clipboardButtonMode: 'copy' | 'paste' = 'paste';
    private usesPointerPanelGuard = 'PointerEvent' in window;
    private dragging = false;
    private dragPointerId = -1;
    private dragStartX = 0;
    private dragStartY = 0;
    private panelStartX = 0;
    private panelStartY = 0;
    private panelX = 0;
    private panelY = 0;
    private initializedPosition = false;
    private lastViewportOffsetLeft = 0;
    private lastViewportOffsetTop = 0;

    constructor(private options: MobileKeysControllerOptions) {
        this.root = document.createElement('div');
        this.root.className = 'mobile-keys-overlay';

        this.panel = document.createElement('div');
        this.panel.className = 'mobile-keys-panel';
        this.root.appendChild(this.panel);

        this.render();
        this.applyAppearance();
        document.body.appendChild(this.root);
        this.syncViewportOffset();
        this.initPosition();
        window.addEventListener('resize', this.onWindowResize);
        window.visualViewport?.addEventListener('resize', this.onViewportResize);
        window.visualViewport?.addEventListener('scroll', this.onViewportScroll);
    }

    dispose() {
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        if (this.usesPointerPanelGuard) {
            this.panel.removeEventListener('pointerdown', this.onPanelPointerDown);
        } else {
            this.panel.removeEventListener('touchstart', this.onPanelTouchStart as EventListener);
            this.panel.removeEventListener('mousedown', this.onPanelMouseDown as EventListener);
        }
        window.removeEventListener('resize', this.onWindowResize);
        window.visualViewport?.removeEventListener('resize', this.onViewportResize);
        window.visualViewport?.removeEventListener('scroll', this.onViewportScroll);
        this.root.remove();
    }

    updateAppearance(opacity: number, scale: number) {
        this.options.opacity = opacity;
        this.options.scale = scale;
        this.applyAppearance();
        window.requestAnimationFrame(() => this.ensureInBounds());
    }

    setClipboardButtonMode(mode: 'copy' | 'paste') {
        this.clipboardButtonMode = mode;
        if (!this.copyButton) return;
        const label = mode === 'copy' ? 'Copy' : 'Paste';
        this.copyButton.textContent = label;
        this.copyButton.setAttribute('aria-label', label);
    }

    consumeModifiers(): ModifierFlags {
        const consumed = { ...this.modifiers };
        if (consumed.ctrl || consumed.alt || consumed.shift) {
            this.modifiers = { ctrl: false, alt: false, shift: false };
            this.syncModifierButtons();
        }
        return consumed;
    }

    private hasModifierOn(): boolean {
        return this.modifiers.ctrl || this.modifiers.alt || this.modifiers.shift;
    }

    private render() {
        const dragBar = document.createElement('div');
        dragBar.className = 'mobile-keys-dragbar';
        dragBar.textContent = 'Drag';
        dragBar.addEventListener('pointerdown', this.onDragStart);
        this.panel.appendChild(dragBar);

        const row1 = document.createElement('div');
        row1.className = 'mobile-keys-row';
        row1.appendChild(this.createVirtualButton('Home', 'home'));
        row1.appendChild(this.createVirtualButton('↑', 'up'));
        row1.appendChild(this.createVirtualButton('End', 'end'));

        const row2 = document.createElement('div');
        row2.className = 'mobile-keys-row';
        row2.appendChild(this.createVirtualButton('←', 'left'));
        row2.appendChild(this.createVirtualButton('↓', 'down'));
        row2.appendChild(this.createVirtualButton('→', 'right'));

        const row3 = document.createElement('div');
        row3.className = 'mobile-keys-row';
        row3.appendChild(this.createVirtualButton('Esc', 'esc'));
        row3.appendChild(this.createModifierButton('Shift', 'shift'));
        row3.appendChild(this.createModifierButton('Alt', 'alt'));

        const row4 = document.createElement('div');
        row4.className = 'mobile-keys-row';
        row4.appendChild(this.createVirtualButton('Tab', 'tab'));
        row4.appendChild(this.createModifierButton('Ctrl', 'ctrl'));
        this.copyButton = this.createButton('Copy', 'copy-btn', this.options.onClipboardAction);
        row4.appendChild(this.copyButton);

        this.panel.appendChild(row1);
        this.panel.appendChild(row2);
        this.panel.appendChild(row3);
        this.panel.appendChild(row4);
        if (this.usesPointerPanelGuard) {
            this.panel.addEventListener('pointerdown', this.onPanelPointerDown);
        } else {
            this.panel.addEventListener('touchstart', this.onPanelTouchStart as EventListener, { passive: false });
            this.panel.addEventListener('mousedown', this.onPanelMouseDown as EventListener);
        }
        this.setClipboardButtonMode(this.clipboardButtonMode);
    }

    private isInteractivePanelTarget(target: EventTarget | null) {
        if (!(target instanceof Element)) return false;
        return !!target.closest('.mobile-keys-btn, .mobile-keys-dragbar');
    }

    private swallowPanelGapEvent(event: Event) {
        if (this.isInteractivePanelTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
    }

    private onPanelPointerDown = (event: PointerEvent) => {
        this.swallowPanelGapEvent(event);
    };

    private onPanelTouchStart = (event: TouchEvent) => {
        this.swallowPanelGapEvent(event);
    };

    private onPanelMouseDown = (event: MouseEvent) => {
        this.swallowPanelGapEvent(event);
    };

    private createVirtualButton(label: string, key: VirtualKey, wide = false): HTMLButtonElement {
        return this.createButton(
            label,
            `key-${key}`,
            () => {
                const modifiers = this.consumeModifiers();
                this.options.onSendVirtualKey(key, modifiers);
            },
            wide
        );
    }

    private createModifierButton(label: string, key: ModifierKey, wide = false): HTMLButtonElement {
        const button = this.createButton(
            label,
            `modifier-${key}`,
            () => {
                this.modifiers[key] = !this.modifiers[key];
                this.syncModifierButtons();
            },
            wide
        );
        this.modifierButtons.set(key, button);
        return button;
    }

    private createButton(label: string, className: string, onClick: () => void, wide = false): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mobile-keys-btn ${className}`;
        if (wide) button.classList.add('is-wide');
        button.textContent = label;
        button.setAttribute('aria-label', label);
        button.tabIndex = -1;
        const handlePress = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        };
        if ('PointerEvent' in window) {
            button.addEventListener('pointerdown', handlePress);
        } else {
            button.addEventListener('touchstart', handlePress as EventListener, { passive: false });
            button.addEventListener('mousedown', handlePress as EventListener);
        }
        button.addEventListener('click', event => event.preventDefault());
        return button;
    }

    private syncModifierButtons() {
        MODIFIER_KEYS.forEach(key => {
            const button = this.modifierButtons.get(key);
            if (!button) return;
            button.classList.toggle('is-active', this.modifiers[key]);
        });
        this.panel.classList.toggle('has-active-modifier', this.hasModifierOn());
    }

    private applyAppearance() {
        const opacity = Number.isFinite(this.options.opacity) ? this.options.opacity : 0.72;
        const scale = Number.isFinite(this.options.scale) ? this.options.scale : 1;
        const clampedOpacity = Math.max(0.4, Math.min(0.95, opacity));
        const clampedScale = Math.max(0.85, Math.min(1.2, scale));
        this.panel.style.setProperty('--mobile-keys-opacity', String(clampedOpacity));
        this.panel.style.setProperty('--mobile-keys-scale', String(clampedScale));
    }

    private initPosition() {
        if (this.initializedPosition) return;
        this.initializedPosition = true;

        const panelRect = this.panel.getBoundingClientRect();
        const viewport = window.visualViewport;
        const offsetLeft = Math.round(viewport?.offsetLeft ?? 0);
        const offsetTop = Math.round(viewport?.offsetTop ?? 0);
        const viewWidth = Math.round(viewport?.width ?? window.innerWidth);
        this.panelX = Math.max(8, offsetLeft + viewWidth - panelRect.width - 12);
        this.panelY = Math.max(8, offsetTop + 12);
        this.applyPanelPosition();
        this.ensureInBounds();
    }

    private clampPosition(x: number, y: number): { x: number; y: number } {
        const rect = this.panel.getBoundingClientRect();
        const viewport = window.visualViewport;
        const offsetLeft = Math.round(viewport?.offsetLeft ?? 0);
        const offsetTop = Math.round(viewport?.offsetTop ?? 0);
        const viewWidth = Math.round(viewport?.width ?? window.innerWidth);
        const viewHeight = Math.round(viewport?.height ?? window.innerHeight);
        const minX = offsetLeft + 8;
        const minY = offsetTop + 8;
        const maxX = Math.max(minX, offsetLeft + viewWidth - rect.width - 8);
        const maxY = Math.max(minY, offsetTop + viewHeight - rect.height - 8);
        return {
            x: Math.min(Math.max(minX, x), maxX),
            y: Math.min(Math.max(minY, y), maxY),
        };
    }

    private applyPanelPosition() {
        this.panel.style.transform = `translate3d(${Math.round(this.panelX)}px, ${Math.round(
            this.panelY
        )}px, 0) scale(var(--mobile-keys-scale))`;
    }

    private onDragStart = (event: PointerEvent) => {
        if (this.dragging) return;
        event.preventDefault();
        this.dragging = true;
        this.dragPointerId = event.pointerId;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.panelStartX = this.panelX;
        this.panelStartY = this.panelY;
        this.panel.classList.add('is-dragging');
        this.panel.setPointerCapture(this.dragPointerId);

        this.panel.addEventListener('pointermove', this.onDragMove);
        this.panel.addEventListener('pointerup', this.onDragEnd);
        this.panel.addEventListener('pointercancel', this.onDragEnd);
    };

    private onDragMove = (event: PointerEvent) => {
        if (!this.dragging || event.pointerId !== this.dragPointerId) return;
        const nextX = this.panelStartX + (event.clientX - this.dragStartX);
        const nextY = this.panelStartY + (event.clientY - this.dragStartY);
        const clamped = this.clampPosition(nextX, nextY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();
    };

    private onDragEnd = (event: PointerEvent) => {
        if (!this.dragging || event.pointerId !== this.dragPointerId) return;
        this.dragging = false;
        this.panel.classList.remove('is-dragging');
        this.panel.releasePointerCapture(this.dragPointerId);
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        this.dragPointerId = -1;

        const clamped = this.clampPosition(this.panelX, this.panelY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();
    };

    private onWindowResize = () => {
        if (!this.initializedPosition) return;
        this.syncViewportOffset();
        this.ensureInBounds();
    };

    private onViewportResize = () => {
        if (!this.initializedPosition) return;
        this.syncViewportOffset();
        this.ensureInBounds();
    };

    private onViewportScroll = () => {
        if (!this.initializedPosition) return;
        const viewport = window.visualViewport;
        if (!viewport) return;
        const nextLeft = Math.round(viewport.offsetLeft);
        const nextTop = Math.round(viewport.offsetTop);
        const deltaLeft = nextLeft - this.lastViewportOffsetLeft;
        const deltaTop = nextTop - this.lastViewportOffsetTop;
        if (deltaLeft !== 0 || deltaTop !== 0) {
            this.panelX += deltaLeft;
            this.panelY += deltaTop;
        }
        this.lastViewportOffsetLeft = nextLeft;
        this.lastViewportOffsetTop = nextTop;
        this.ensureInBounds();
    };

    private ensureInBounds() {
        const clamped = this.clampPosition(this.panelX, this.panelY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();
    }

    private syncViewportOffset() {
        const viewport = window.visualViewport;
        this.lastViewportOffsetLeft = Math.round(viewport?.offsetLeft ?? 0);
        this.lastViewportOffsetTop = Math.round(viewport?.offsetTop ?? 0);
    }
}
