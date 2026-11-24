import { bind } from 'decko';
import { Component, ComponentChildren, h } from 'preact';

import './modal.scss';

interface Props {
    show: boolean;
    children: ComponentChildren;
    title?: string;
    onClose?: () => void;
}

export class Modal extends Component<Props> {
    constructor(props: Props) {
        super(props);
    }

    componentDidMount() {
        document.addEventListener('keydown', this.onKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.onKeyDown);
    }

    @bind
    onKeyDown(event: KeyboardEvent) {
        if (!this.props.show || event.key !== 'Escape') return;
        event.preventDefault();
        this.props.onClose?.();
    }

    render({ show, children, title, onClose }: Props) {
        return (
            show && (
                <div className="modal">
                    <div className="modal-background" onClick={() => onClose?.()} />
                    <div className="modal-content">
                        <div className="box">
                            {title && <header>{title}</header>}
                            {children}
                            {onClose && (
                                <button class="modal-close" type="button" aria-label="Close" onClick={onClose}>
                                    ×
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )
        );
    }
}
