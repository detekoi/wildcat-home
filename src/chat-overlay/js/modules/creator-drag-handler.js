/**
 * Creator Drag Handler Module
 * Manages drag-and-drop event handling for reordering scene items in the sidebar list.
 */

export class CreatorDragHandler {
    /**
     * @param {HTMLElement} listContainer - HTML container element for the instance list
     * @param {Object} callbacks
     * @param {Function} callbacks.getOrder - Returns current instanceOrder array
     * @param {Function} callbacks.onReorder - Called when items are reordered with new instanceOrder array
     */
    constructor(listContainer, { getOrder, onReorder }) {
        this.listContainer = listContainer;
        this.getOrder = getOrder;
        this.onReorder = onReorder;
        this.draggedItemId = null;
    }

    attach() {
        if (!this.listContainer) return;
        this._boundStart = this.handleDragStart.bind(this);
        this._boundOver = this.handleDragOver.bind(this);
        this._boundEnter = this.handleDragEnter.bind(this);
        this._boundLeave = this.handleDragLeave.bind(this);
        this._boundDrop = this.handleDrop.bind(this);
        this._boundEnd = this.handleDragEnd.bind(this);

        this.listContainer.addEventListener('dragstart', this._boundStart);
        this.listContainer.addEventListener('dragover', this._boundOver);
        this.listContainer.addEventListener('dragenter', this._boundEnter);
        this.listContainer.addEventListener('dragleave', this._boundLeave);
        this.listContainer.addEventListener('drop', this._boundDrop);
        this.listContainer.addEventListener('dragend', this._boundEnd);
    }

    detach() {
        if (!this.listContainer) return;
        this.listContainer.removeEventListener('dragstart', this._boundStart);
        this.listContainer.removeEventListener('dragover', this._boundOver);
        this.listContainer.removeEventListener('dragenter', this._boundEnter);
        this.listContainer.removeEventListener('dragleave', this._boundLeave);
        this.listContainer.removeEventListener('drop', this._boundDrop);
        this.listContainer.removeEventListener('dragend', this._boundEnd);
    }

    handleDragEnd() {
        this.draggedItemId = null;
        if (this.listContainer) {
            this.listContainer.querySelectorAll('.instance-item').forEach(item => {
                item.classList.remove('drag-over');
            });
        }
    }

    handleDragStart(e) {
        const target = e.target.closest('.instance-item');
        if (target) {
            this.draggedItemId = target.dataset.id;
            e.dataTransfer.effectAllowed = 'move';
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        const target = e.target.closest('.instance-item');
        if (target) target.classList.add('drag-over');
    }

    handleDragLeave(e) {
        const target = e.target.closest('.instance-item');
        if (target) target.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        const target = e.target.closest('.instance-item');
        if (target) {
            target.classList.remove('drag-over');
            const dropId = target.dataset.id;
            const instanceOrder = this.getOrder();
            if (this.draggedItemId && dropId && this.draggedItemId !== dropId) {
                const fromIdx = instanceOrder.indexOf(this.draggedItemId);
                const toIdx = instanceOrder.indexOf(dropId);
                if (fromIdx !== -1 && toIdx !== -1) {
                    const newOrder = [...instanceOrder];
                    newOrder.splice(fromIdx, 1);
                    newOrder.splice(toIdx, 0, this.draggedItemId);
                    if (this.onReorder) {
                        this.onReorder(newOrder);
                    }
                }
            }
        }
    }
}
