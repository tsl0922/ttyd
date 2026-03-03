export type ModifierFlags = {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
};

export type VirtualKey = 'esc' | 'tab' | 'up' | 'down' | 'left' | 'right' | 'home' | 'end';

type ModifierKey = keyof ModifierFlags;

interface MobileKeysControllerOptions {
    mountElement: HTMLElement;
    opacity: number;
    scale: number;
    onClipboardAction: () => void;
    onFocusTerminal: () => void;
    onSendVirtualKey: (key: VirtualKey, modifiers: ModifierFlags) => void;
    onSendWheelStep: (direction: 1 | -1) => void;
    wheelOnHoldEnabled: boolean;
    wheelOnHoldDelayMs: number;
    wheelOnHoldIntervalMs: number;
}

const MODIFIER_KEYS: ModifierKey[] = ['ctrl', 'alt', 'shift'];

const PANEL_INITIAL_MARGIN = 15;
const PANEL_MIN_MARGIN = 10;

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
    private ensureInBoundsRaf = -1;
    private boundsResizeObserver?: ResizeObserver;
    private wheelHoldDelayTimer = -1;
    private wheelHoldIntervalTimer = -1;
    private wheelHoldTriggered = false;

    constructor(private options: MobileKeysControllerOptions) {
        this.root = document.createElement('div');
        this.root.className = 'mobile-keys-overlay';

        this.panel = document.createElement('div');
        this.panel.className = 'mobile-keys-panel';
        this.root.appendChild(this.panel);

        this.render();
        this.applyAppearance();
        this.options.mountElement.appendChild(this.root);
        this.initPosition();
        if ('ResizeObserver' in window) {
            this.boundsResizeObserver = new ResizeObserver(() => this.requestEnsureInBounds());
            this.boundsResizeObserver.observe(this.options.mountElement);
        }
        window.addEventListener('resize', this.onWindowResize);
        window.visualViewport?.addEventListener('resize', this.onViewportResize);
        window.visualViewport?.addEventListener('scroll', this.onViewportScroll);
    }

    dispose() {
        this.stopWheelHoldTimers();
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        this.panel.removeEventListener('contextmenu', this.onPanelContextMenu);
        if (this.usesPointerPanelGuard) {
            this.panel.removeEventListener('pointerdown', this.onPanelPointerDown);
        } else {
            this.panel.removeEventListener('touchstart', this.onPanelTouchStart as EventListener);
            this.panel.removeEventListener('mousedown', this.onPanelMouseDown as EventListener);
        }
        window.removeEventListener('resize', this.onWindowResize);
        window.visualViewport?.removeEventListener('resize', this.onViewportResize);
        window.visualViewport?.removeEventListener('scroll', this.onViewportScroll);
        if (this.ensureInBoundsRaf >= 0) {
            window.cancelAnimationFrame(this.ensureInBoundsRaf);
            this.ensureInBoundsRaf = -1;
        }
        this.boundsResizeObserver?.disconnect();
        this.boundsResizeObserver = undefined;
        this.root.remove();
    }

    updateAppearance(opacity: number, scale: number) {
        this.options.opacity = opacity;
        this.options.scale = scale;
        this.applyAppearance();
        window.requestAnimationFrame(() => this.ensureInBounds());
    }

    updateWheelHoldBehavior(enabled: boolean, delayMs: number, intervalMs: number) {
        this.options.wheelOnHoldEnabled = enabled;
        this.options.wheelOnHoldDelayMs = delayMs;
        this.options.wheelOnHoldIntervalMs = intervalMs;
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

    consumeAltModifierForTapSelection(): boolean {
        if (!this.modifiers.alt) return false;
        this.modifiers.alt = false;
        this.syncModifierButtons();
        return true;
    }

    consumeShiftModifierForTapSelection(): boolean {
        if (!this.modifiers.shift) return false;
        this.modifiers.shift = false;
        this.syncModifierButtons();
        return true;
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
        row1.appendChild(this.createVirtualButton('S↑', 'up'));
        row1.appendChild(this.createVirtualButton('End', 'end'));

        const row2 = document.createElement('div');
        row2.className = 'mobile-keys-row';
        row2.appendChild(this.createVirtualButton('←', 'left'));
        row2.appendChild(this.createVirtualButton('S↓', 'down'));
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
        this.copyButton = this.createClickButton('Copy', 'copy-btn', this.options.onClipboardAction);
        row4.appendChild(this.copyButton);

        this.panel.appendChild(row1);
        this.panel.appendChild(row2);
        this.panel.appendChild(row3);
        this.panel.appendChild(row4);
        this.panel.addEventListener('contextmenu', this.onPanelContextMenu);
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

    private onPanelContextMenu = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    private createVirtualButton(label: string, key: VirtualKey, wide = false): HTMLButtonElement {
        if (key === 'up' || key === 'down') {
            return this.createArrowButtonWithWheelHold(label, key, wide);
        }
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

    private createArrowButtonWithWheelHold(label: string, key: 'up' | 'down', wide = false): HTMLButtonElement {
        const button = this.createBaseButton(label, `key-${key}`, wide);
        const wheelDirection: 1 | -1 = key === 'up' ? -1 : 1;
        let pressArmed = false;

        const sendArrowKey = () => {
            const modifiers = this.consumeModifiers();
            this.options.onSendVirtualKey(key, modifiers);
        };

        const startHold = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!this.options.wheelOnHoldEnabled || this.hasModifierOn()) {
                pressArmed = false;
                sendArrowKey();
                return;
            }

            pressArmed = true;
            this.stopWheelHoldTimers();
            this.wheelHoldTriggered = false;
            const delayMs = Math.max(100, this.options.wheelOnHoldDelayMs);
            const intervalMs = Math.max(30, this.options.wheelOnHoldIntervalMs);
            this.wheelHoldDelayTimer = window.setTimeout(() => {
                this.wheelHoldTriggered = true;
                this.options.onSendWheelStep(wheelDirection);
                this.wheelHoldIntervalTimer = window.setInterval(() => {
                    this.options.onSendWheelStep(wheelDirection);
                }, intervalMs);
            }, delayMs);
        };

        const stopHold = (event?: Event) => {
            event?.preventDefault();
            event?.stopPropagation();
            if (!pressArmed) return;
            pressArmed = false;
            const triggered = this.wheelHoldTriggered;
            this.stopWheelHoldTimers();
            if (!triggered) sendArrowKey();
        };

        if ('PointerEvent' in window) {
            button.addEventListener('pointerdown', startHold);
            button.addEventListener('pointerup', stopHold as EventListener);
            button.addEventListener('pointercancel', stopHold as EventListener);
            button.addEventListener('pointerleave', stopHold as EventListener);
        } else {
            button.addEventListener('touchstart', startHold as EventListener, { passive: false });
            button.addEventListener('touchend', stopHold as EventListener);
            button.addEventListener('touchcancel', stopHold as EventListener);
            button.addEventListener('mousedown', startHold as EventListener);
            button.addEventListener('mouseup', stopHold as EventListener);
            button.addEventListener('mouseleave', stopHold as EventListener);
        }
        button.addEventListener('click', event => event.preventDefault());
        return button;
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
        const button = this.createBaseButton(label, className, wide);
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

    private createClickButton(label: string, className: string, onClick: () => void, wide = false): HTMLButtonElement {
        const button = this.createBaseButton(label, className, wide);
        const preventButtonFocus = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
        };
        if ('PointerEvent' in window) {
            button.addEventListener('pointerdown', preventButtonFocus);
        } else {
            button.addEventListener('mousedown', preventButtonFocus as EventListener);
        }
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
            this.options.onFocusTerminal();
        });
        return button;
    }

    private createBaseButton(label: string, className: string, wide: boolean): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mobile-keys-btn ${className}`;
        if (wide) button.classList.add('is-wide');
        button.textContent = label;
        button.setAttribute('aria-label', label);
        button.tabIndex = -1;
        return button;
    }

    private stopWheelHoldTimers() {
        if (this.wheelHoldDelayTimer >= 0) {
            window.clearTimeout(this.wheelHoldDelayTimer);
            this.wheelHoldDelayTimer = -1;
        }
        if (this.wheelHoldIntervalTimer >= 0) {
            window.clearInterval(this.wheelHoldIntervalTimer);
            this.wheelHoldIntervalTimer = -1;
        }
        this.wheelHoldTriggered = false;
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
        const boundsRect = this.options.mountElement.getBoundingClientRect();
        this.panelX = Math.max(PANEL_MIN_MARGIN, Math.round(boundsRect.width - panelRect.width - PANEL_INITIAL_MARGIN));
        this.panelY = PANEL_INITIAL_MARGIN;
        this.applyPanelPosition();
        this.ensureInBounds();
    }

    private clampPosition(x: number, y: number): { x: number; y: number } {
        const panelRect = this.panel.getBoundingClientRect();
        const boundsRect = this.options.mountElement.getBoundingClientRect();
        const minX = PANEL_MIN_MARGIN;
        const minY = PANEL_MIN_MARGIN;
        const maxX = Math.max(minX, Math.round(boundsRect.width - panelRect.width - PANEL_MIN_MARGIN));
        const maxY = Math.max(minY, Math.round(boundsRect.height - panelRect.height - PANEL_MIN_MARGIN));
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
        this.requestEnsureInBounds();
    };

    private onViewportResize = () => {
        if (!this.initializedPosition) return;
        this.requestEnsureInBounds();
    };

    private onViewportScroll = () => {
        if (!this.initializedPosition) return;
        this.requestEnsureInBounds();
    };

    private requestEnsureInBounds() {
        if (this.ensureInBoundsRaf >= 0) return;
        this.ensureInBoundsRaf = window.requestAnimationFrame(() => {
            this.ensureInBoundsRaf = -1;
            this.ensureInBounds();
        });
    }

    private ensureInBounds() {
        const clamped = this.clampPosition(this.panelX, this.panelY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();
    }
}
