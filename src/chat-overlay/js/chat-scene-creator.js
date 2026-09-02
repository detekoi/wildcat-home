/**
 * Chat Scene Creator JavaScript Module
 * Orchestrates chat scene creation, settings customization, live preview streaming, and Firestore web sync.
 */

import { ConfigManager, migrateConfig } from './modules/config-manager.js';
import { UIHelpers } from './modules/ui-helpers.js';
import { CreatorFormRenderer } from './modules/creator-form-renderer.js';
import { CreatorInstanceManager } from './modules/creator-instance-manager.js';
import { CreatorSyncManager } from './modules/creator-sync-manager.js';
import { CreatorIOManager } from './modules/creator-io-manager.js';
import { CreatorDragHandler } from './modules/creator-drag-handler.js';
import { ModalA11y } from './modules/modal-a11y.js';
import { login, handleRedirect, restoreSession, logout, getCachedUser, clearSession } from './modules/twitch-auth.js';
import { AUTH_EXPIRED_EVENT, fetchAccount, linkScenes, unlinkScene, setSceneOrder } from './modules/account-client.js';
import { mergeSceneOrder } from './modules/account-merge.js';

// The Twitch access token rides in the URL hash on a successful OAuth redirect
// and must be stripped before any other deferred script (analytics) runs, so
// this has to happen at module top level, before DOMContentLoaded.
const authRedirect = handleRedirect();

document.addEventListener('DOMContentLoaded', () => {
    class ChatSceneCreatorApp {
        constructor() {
            this.configManagerHelper = new ConfigManager();
            this.dom = {};
            this.isDirty = false;
            this.isPopulating = false;

            this.accountUser = null;
            this.accountTokens = new Set();
            this._accountSyncInFlight = false;
            this._revalidateTimer = null;
            this._orderPushTimer = null;

            this.initializeDOM();

            // Create the toast live region up front rather than on the first toast:
            // a live region must exist before content is inserted to announce
            // reliably, and modal-a11y snapshots the DOM when a dialog opens, so a
            // container that appears later escapes being inerted.
            UIHelpers.ensureToastContainer();

            // Instantiate modules
            this.formRenderer = new CreatorFormRenderer({
                configManager: this.configManagerHelper,
                previewIframe: this.dom.previewIframe,
                onFormChange: () => {
                    if (!this.isPopulating) this.setDirty(true);
                }
            });

            this.instanceManager = new CreatorInstanceManager({
                getDefaultConfig: () => this.configManagerHelper.getDefaultConfig(),
                onNotification: (title, msg, type) => UIHelpers.showNotification(title, msg, type)
            });

            this.syncManager = new CreatorSyncManager({
                onNotification: (title, msg, type) => UIHelpers.showNotification(title, msg, type),
                onRemoteUpdate: (instance) => {
                    this.formRenderer.populateForm(instance, this.dom);
                    this.formRenderer.sendPreviewUpdate();
                }
            });

            this.dragHandler = new CreatorDragHandler(this.dom.instanceList, {
                getOrder: () => this.instanceManager.instanceOrder,
                onReorder: (newOrder) => {
                    this.instanceManager.instanceOrder = newOrder;
                    this.instanceManager.saveInstances();
                    this.renderInstanceList();
                    this.pushOrderToAccount();
                }
            });

            // Initialize UI
            this.formRenderer.renderSchemaForm(document.getElementById('generatedSchemaForm'));
            this.instanceManager.loadInstances();
            this.renderInstanceList();
            this.setupEventListeners();
            this.setupPreviewBgSelector();
            this.formRenderer.setupFormLivePreview();
            this.dragHandler.attach();
            this.setupAccordion();

            // Select initial instance
            if (this.instanceManager.instanceOrder.length > 0) {
                const firstId = this.instanceManager.instanceOrder[0];
                if (this.instanceManager.instances[firstId]) {
                    this.selectInstance(firstId);
                } else {
                    this.instanceManager.showEmptyState(this.dom);
                }
            } else {
                this.instanceManager.showEmptyState(this.dom);
            }

            // Event delegation: the plate's innerHTML is fully re-rendered by
            // renderAccountUI(), which would detach a directly-bound listener.
            if (this.dom.accountPlate) {
                this.dom.accountPlate.addEventListener('click', (e) => {
                    if (e.target.closest('#twitchLoginBtn')) {
                        this.handleLogin();
                    } else if (e.target.closest('#twitchLogoutBtn')) {
                        this.handleLogout();
                    }
                });
            }

            // Not awaited: account sync happens in the background so first paint
            // isn't blocked on a network round trip.
            this.initAccount(authRedirect);
        }

        setupAccordion() {
            document.querySelectorAll('.accordion-header').forEach(header => {
                header.addEventListener('click', () => {
                    const accordion = header.closest('.accordion');
                    const isExpanded = header.getAttribute('aria-expanded') === 'true';
                    accordion.classList.toggle('active');
                    header.setAttribute('aria-expanded', !isExpanded);
                    document.querySelectorAll('.accordion.active').forEach(other => {
                        if (other !== accordion) {
                            other.classList.remove('active');
                            other.querySelector('.accordion-header')?.setAttribute('aria-expanded', 'false');
                        }
                    });
                });
            });
        }

        initializeDOM() {
            this.dom = {
                instanceList: document.getElementById('instanceList'),
                accountPlate: document.getElementById('accountPlate'),
                createInstanceBtn: document.getElementById('createInstanceBtn'),
                importBtn: document.getElementById('importBtn'),
                exportAllBtn: document.getElementById('exportAllBtn'),
                workspaceTitle: document.getElementById('workspaceTitle'),
                workspaceActions: document.getElementById('workspaceActions'),
                configLayout: document.getElementById('configLayout'),
                emptyState: document.getElementById('emptyState'),
                emptyStateCreateBtn: document.getElementById('emptyStateCreateBtn'),
                obsSetup: document.getElementById('obsSetup'),
                duplicateBtn: document.getElementById('duplicateBtn'),
                deleteBtn: document.getElementById('deleteBtn'),
                exportBtn: document.getElementById('exportBtn'),
                instanceName: document.getElementById('instanceName'),
                syncTokenDisplay: document.getElementById('syncTokenDisplay'),
                copySyncTokenBtn: document.getElementById('copySyncTokenBtn'),
                creatorTwitchChannel: document.getElementById('creatorTwitchChannel'),
                creatorYoutubeTarget: document.getElementById('creatorYoutubeTarget'),
                applyChannelBtn: document.getElementById('applyChannelBtn'),
                saveSettingsBtn: document.getElementById('saveSettingsBtn'),
                instanceUrlConfig: document.getElementById('instanceUrlConfig'),
                instanceUrlSetup: document.getElementById('instanceUrlSetup'),
                copyUrlBtnConfig: document.getElementById('copyUrlBtnConfig'),
                copyUrlBtnSetup: document.getElementById('copyUrlBtnSetup'),
                previewIframe: document.getElementById('previewIframe'),
                previewIframeContainer: document.getElementById('previewIframeContainer'),
                previewBgBtns: document.querySelectorAll('.preview-bg-btn'),
                previewBgColorInput: document.getElementById('previewBgColorInput'),
                previewCustomSwatch: document.getElementById('previewCustomSwatch'),
                instanceModal: document.getElementById('instanceModal'),
                modalTitle: document.getElementById('modalTitle'),
                modalInstanceName: document.getElementById('modalInstanceName'),
                modalCancelBtn: document.getElementById('modalCancelBtn'),
                modalCreateBtn: document.getElementById('modalCreateBtn'),
                importSceneBtn: document.getElementById('importSceneBtn'),
                importSceneModal: document.getElementById('importSceneModal'),
                importSceneToken: document.getElementById('importSceneToken'),
                importModalCancelBtn: document.getElementById('importModalCancelBtn'),
                importModalConfirmBtn: document.getElementById('importModalConfirmBtn'),
                unsavedChangesModal: document.getElementById('unsavedChangesModal'),
                unsavedModalTitle: document.getElementById('unsavedModalTitle'),
                unsavedModalMessage: document.getElementById('unsavedModalMessage'),
                unsavedSaveBtn: document.getElementById('unsavedSaveBtn'),
                unsavedDiscardBtn: document.getElementById('unsavedDiscardBtn'),
                unsavedCancelBtn: document.getElementById('unsavedCancelBtn')
            };
        }

        setDirty(isDirty) {
            this.isDirty = !!isDirty;
            this.updateDirtyUI();
        }

        updateDirtyUI() {
            const saveBtn = this.dom.saveSettingsBtn;
            const workspaceTitle = this.dom.workspaceTitle;
            const currentId = this.instanceManager.currentInstanceId;

            if (saveBtn && !saveBtn.disabled) {
                if (this.isDirty) {
                    saveBtn.classList.add('btn-dirty');
                    saveBtn.innerHTML = '<i data-lucide="save" class="lucide-inline"></i> Save & Sync Settings <span class="unsaved-badge">● Unsaved</span>';
                } else {
                    saveBtn.classList.remove('btn-dirty');
                    saveBtn.innerHTML = '<i data-lucide="save" class="lucide-inline"></i> Save & Sync Settings';
                }
                if (window.lucide) window.lucide.createIcons();
            }

            if (workspaceTitle && currentId && this.instanceManager.instances[currentId]) {
                const name = this.instanceManager.instances[currentId].name;
                if (this.isDirty) {
                    workspaceTitle.innerHTML = `${UIHelpers.escapeHtml(name)} <span class="unsaved-title-badge">● Unsaved</span>`;
                } else {
                    workspaceTitle.textContent = name;
                }
            }

            if (this.dom.instanceList && currentId) {
                const activeItem = this.dom.instanceList.querySelector(`.instance-item[data-id="${currentId}"]`);
                if (activeItem) {
                    const nameEl = activeItem.querySelector('.instance-name');
                    if (nameEl) {
                        const name = this.instanceManager.instances[currentId]?.name || 'Untitled Scene';
                        if (this.isDirty) {
                            nameEl.innerHTML = `${UIHelpers.escapeHtml(name)} <span class="unsaved-dot" title="Unsaved changes">●</span>`;
                        } else {
                            nameEl.textContent = name;
                        }
                    }
                }
            }
        }

        async confirmSaveIfDirty(actionDescription = 'switching scenes') {
            if (!this.isDirty || !this.instanceManager.currentInstanceId) return true;
            const currentName = this.instanceManager.instances[this.instanceManager.currentInstanceId]?.name || 'Current scene';

            const modal = this.dom.unsavedChangesModal;
            if (!modal) {
                const saveFirst = window.confirm(`You have unsaved changes in "${currentName}". Save changes before ${actionDescription}?`);
                if (saveFirst) {
                    await this.saveCurrentInstance({ includeChannel: false });
                    return true;
                }
                return false;
            }

            if (this.dom.unsavedModalMessage) {
                this.dom.unsavedModalMessage.textContent = `You have unsaved changes in "${currentName}". Choose an action before ${actionDescription}:`;
            }

            return new Promise((resolve) => {
                let settled = false;

                /**
                 * Tears the dialog down and returns the element to refocus.
                 * Idempotent — Escape, backdrop and the three buttons can all race,
                 * and an external Escape listener means cleanup is no longer the
                 * single teardown path it used to be.
                 */
                const settle = () => {
                    if (settled) return null;
                    settled = true;
                    const trigger = ModalA11y.close(modal);
                    modal.style.display = 'none';
                    this.dom.unsavedSaveBtn?.removeEventListener('click', handleSave);
                    this.dom.unsavedDiscardBtn?.removeEventListener('click', handleDiscard);
                    this.dom.unsavedCancelBtn?.removeEventListener('click', handleCancel);
                    modal.removeEventListener('click', handleBackdrop);
                    return trigger;
                };

                const handleSave = async () => {
                    const trigger = settle();
                    // saveCurrentInstance is try/finally with no catch, so a failure
                    // inside it (a localStorage QuotaExceededError, a rejected cloud
                    // push) propagates here. Unguarded, resolve() would never run and
                    // every awaiting caller — scene switch, duplicate, delete — would
                    // hang forever with no indication anything went wrong.
                    let saved = true;
                    try {
                        await this.saveCurrentInstance({ includeChannel: false });
                    } catch (err) {
                        console.error('[SceneCreator] Save failed while confirming unsaved changes:', err);
                        // Name the abandoned action: the user asked to save and
                        // proceed, and the thing they were proceeding to silently
                        // does not happen — there is no other cue that it did not.
                        UIHelpers.showNotification('Save Failed', `Changes could not be saved. ${actionDescription} was cancelled. Try again.`, 'error');
                        saved = false;
                    }
                    // Refocus AFTER the save: it re-renders the instance list, which
                    // destroys the item that had focus. Restoring first would leave
                    // focus on a detached node, i.e. on <body>.
                    this.restoreFocusTo(trigger);
                    // Resolving false on failure abandons the pending action rather
                    // than proceeding as though the changes were written.
                    resolve(saved);
                };

                const handleDiscard = () => {
                    const trigger = settle();
                    this.setDirty(false);
                    this.restoreFocusTo(trigger);
                    resolve(true);
                };

                const handleCancel = () => {
                    this.restoreFocusTo(settle());
                    resolve(false);
                };

                const handleBackdrop = (e) => {
                    if (e.target === modal) handleCancel();
                };

                this.dom.unsavedSaveBtn?.addEventListener('click', handleSave);
                this.dom.unsavedDiscardBtn?.addEventListener('click', handleDiscard);
                this.dom.unsavedCancelBtn?.addEventListener('click', handleCancel);
                modal.addEventListener('click', handleBackdrop);

                modal.style.display = 'flex';
                // Escape maps to Cancel, matching the backdrop: nothing saved,
                // nothing discarded, dirty state preserved.
                ModalA11y.open(modal, { onRequestClose: handleCancel });
                // aria-modal hides the trigger from assistive technology the moment
                // this opens, so focus has to move inside. Cancel is least destructive.
                this.dom.unsavedCancelBtn?.focus();
            });
        }

        renderInstanceList() {
            this.instanceManager.renderInstanceList(
                this.dom.instanceList,
                (id) => this.selectInstance(id),
                () => this.isDirty,
                { isInAccount: (inst) => !!this.accountUser && this.accountTokens.has(inst.syncToken) }
            );
        }

        async selectInstance(instanceId) {
            if (this.instanceManager.currentInstanceId) {
                const actionDesc = (this.instanceManager.currentInstanceId === instanceId)
                    ? 'reloading this scene'
                    : 'switching scenes';
                const confirmed = await this.confirmSaveIfDirty(actionDesc);
                if (!confirmed) return false;
            }

            const instance = this.instanceManager.instances[instanceId];
            if (!instance) {
                UIHelpers.showNotification('Error', 'Chat scene not found.', 'error');
                return false;
            }

            this.isPopulating = true;

            try {
                this.instanceManager.currentInstanceId = instanceId;

                if (this.dom.emptyState) this.dom.emptyState.style.display = 'none';
                if (this.dom.configLayout) this.dom.configLayout.style.display = 'grid';
                if (this.dom.workspaceActions) this.dom.workspaceActions.style.display = 'flex';
                if (this.dom.workspaceTitle) this.dom.workspaceTitle.textContent = instance.name;

                document.querySelectorAll('.instance-item').forEach(item => {
                    item.classList.toggle('active', item.dataset.id === instanceId);
                });

                this.formRenderer.populateForm(instance, this.dom);
                this.syncManager.updateInstanceUrl(instance, instanceId, this.dom);

                // Backfill scenes created before tokens were minted automatically. Must run
                // before subscribing so the subscription always has a token to attach to.
                await this.ensureSyncTokenAndPush(instanceId);

                // If ensureSyncTokenAndPush minted a new token, the form was already
                // populated with '' — update the Sync Token field to reflect it.
                if (this.dom.syncTokenDisplay && instance.syncToken) {
                    this.dom.syncTokenDisplay.value = instance.syncToken;
                }

                this.syncManager.subscribeToRemoteChanges(
                    instance.syncToken,
                    instanceId,
                    (id) => this.instanceManager.instances[id],
                    () => this.instanceManager.saveInstances(),
                    () => this.instanceManager.currentInstanceId
                );

                if (this.dom.previewIframe) {
                    const syncParam = instance.syncToken ? `&sync=${encodeURIComponent(instance.syncToken)}` : '';
                    this.dom.previewIframe.src = `chat.html?demo=1&scene=${encodeURIComponent(instanceId)}${syncParam}`;
                    this.dom.previewIframe.addEventListener('load', () => this.formRenderer.sendPreviewUpdate(), { once: true });
                }
                this.formRenderer.sendPreviewUpdate();
            } finally {
                this.isPopulating = false;
                this.setDirty(false);
            }
            return true;
        }

        async saveCurrentInstance({ includeChannel = false } = {}) {
            const currentId = this.instanceManager.currentInstanceId;
            const instance = this.instanceManager.instances[currentId];
            if (!currentId || !instance) {
                UIHelpers.showNotification('Error', 'No chat scene selected.', 'error');
                return;
            }

            const saveBtn = this.dom.saveSettingsBtn;
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.classList.remove('btn-dirty');
                saveBtn.innerHTML = '<i data-lucide="loader" class="lucide-inline spin"></i> Saving & Syncing...';
                if (window.lucide) window.lucide.createIcons();
            }

            try {
                instance.name = this.dom.instanceName.value.trim() || instance.name;
                instance.lastModified = new Date().toISOString();

                const updatedConfig = this.formRenderer.readFormConfig(instance.config, this.dom, { includeChannel });
                instance.config = updatedConfig;

                this.instanceManager.saveInstances();
                localStorage.setItem(`chatConfig-${currentId}`, JSON.stringify(updatedConfig));

                this.setDirty(false);
                this.renderInstanceList();

                if (instance.syncToken) {
                    const pushResult = await this.syncManager.pushToCloud(instance.syncToken, updatedConfig, instance.name);
                    if (pushResult.success) {
                        UIHelpers.showNotification('Saved & Synced', `"${instance.name}" saved and synced to OBS.`, 'success');
                    } else {
                        UIHelpers.showNotification('Saved Locally', 'Saved locally, but cloud sync failed.', 'warning');
                    }
                    // The account registry keeps its own copy of the name (the
                    // config doc's sceneName gets overwritten with the scene id by
                    // the overlay), so a rename has to be sent explicitly. No force:
                    // saving must not resurrect a scene unlinked elsewhere.
                    if (this.accountUser && this.accountTokens.has(instance.syncToken)) {
                        this.linkToAccount([instance], { force: false });
                    }
                } else {
                    UIHelpers.showNotification('Saved Locally', `"${instance.name}" saved locally.`, 'success');
                }
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    this.updateDirtyUI();
                }
            }
        }

        async applyChannel() {
            if (!this.instanceManager.currentInstanceId) return;
            const twitch = this.dom.creatorTwitchChannel?.value?.trim();
            const youtube = this.dom.creatorYoutubeTarget?.value?.trim();

            await this.saveCurrentInstance({ includeChannel: true });
            this.formRenderer.sendPreviewUpdate();
            UIHelpers.showNotification('Channel Connection Updated', `Connected to Twitch: ${twitch || 'None'}, YouTube: ${youtube || 'None'}`);
        }

        // Mint and push must happen atomically: a token that exists locally but has no
        // matching Firestore doc yet is a race waiting to happen. The overlay's own
        // handleSnapshot treats a missing doc as "nobody has claimed this yet" and uploads
        // its local config to claim it — so if the OBS browser source connects before this
        // push lands, it silently overwrites the streamer's in-progress edits here.
        async ensureSyncTokenAndPush(instanceId) {
            const instance = this.instanceManager.instances[instanceId];
            if (!instance) return;

            const minted = this.instanceManager.ensureSyncToken(instanceId);
            if (!minted) return;

            const pushResult = await this.syncManager.pushToCloud(minted, instance.config, instance.name);
            if (!pushResult.success) {
                UIHelpers.showNotification('Sync Pending', 'Scene saved locally. Cloud sync will retry on next save.', 'warning');
            }

            this.syncManager.updateInstanceUrl(instance, instanceId, this.dom);
        }

        importScene() {
            const modal = this.dom.importSceneModal;
            if (!modal) return;
            if (this.dom.importSceneToken) this.dom.importSceneToken.value = '';
            modal.style.display = 'flex';
            ModalA11y.open(modal, { onRequestClose: () => this.closeImportSceneModal() });
            (this.dom.importSceneToken || modal).focus();
        }

        closeImportSceneModal() {
            const modal = this.dom.importSceneModal;
            if (!modal) return;
            // Release inertness before focusing — focus() on an inert element is a
            // silent no-op.
            const trigger = ModalA11y.close(modal);
            modal.style.display = 'none';
            this.restoreFocusTo(trigger);
        }

        /**
         * Refocuses a dialog's trigger, re-querying it when the instance list has
         * re-rendered underneath and destroyed the original node.
         */
        restoreFocusTo(el) {
            if (!el) return;
            if (el.isConnected) {
                el.focus();
                return;
            }
            const id = el.dataset?.id;
            if (id) {
                this.dom.instanceList?.querySelector(`.instance-item[data-id="${id}"]`)?.focus();
            }
        }

        confirmImportScene() {
            const rawInput = this.dom.importSceneToken?.value?.trim();
            if (!rawInput) {
                UIHelpers.showNotification('Error', 'Enter a Sync Token or OBS URL to link.', 'error');
                return;
            }

            let extractedToken = rawInput;
            if (rawInput.includes('sync=')) {
                try {
                    let urlString = rawInput;
                    if (!/^https?:\/\//i.test(rawInput) && !/^file:\/\//i.test(rawInput)) {
                        // Extract only the query string so URL() parses the params correctly.
                        // e.g. "chat.html?scene=x&sync=UUID" → "?scene=x&sync=UUID"
                        const qIdx = rawInput.indexOf('?');
                        const queryPart = qIdx !== -1 ? rawInput.substring(qIdx) : `?${rawInput}`;
                        urlString = `https://dummy.host/${queryPart}`;
                    }
                    const urlParams = new URL(urlString).searchParams;
                    const syncParam = urlParams.get('sync');
                    if (syncParam) extractedToken = syncParam;
                } catch (e) {
                    const match = rawInput.match(/[?&]sync=([^&#]+)/);
                    if (match && match[1]) extractedToken = decodeURIComponent(match[1]);
                }
            }

            const token = UIHelpers.normalizeSyncToken(extractedToken);
            if (!token) {
                UIHelpers.showNotification('Invalid Token', 'The input does not contain a valid sync token UUID.', 'error');
                return;
            }

            // Two local scenes on one token would share a Firestore doc and overwrite each
            // other — the same failure duplicate mints a fresh token to avoid.
            const existingId = Object.keys(this.instanceManager.instances)
                .find((id) => this.instanceManager.instances[id].syncToken === token);
            if (existingId) {
                this.closeImportSceneModal();
                this.selectInstance(existingId);
                UIHelpers.showNotification('Already Linked', 'This scene is already linked in this browser.');
                // Explicit action re-links a scene even if the account had it
                // tombstoned (unlinked elsewhere) — unlike the automatic merge in
                // syncWithAccount, which must leave a tombstone alone.
                this.linkToAccount([this.instanceManager.instances[existingId]]);
                return;
            }

            // Linking gets its own scene rather than repointing the selected one, which would
            // orphan that scene's OBS source. Sharing the remote token is the entire point
            // here, unlike duplicate. Deliberately no push: this scene's config is still
            // empty defaults and would overwrite the remote scene — the Firestore snapshot
            // populates it instead.
            const newId = this.instanceManager.createLinkedInstance({ name: 'Linked Scene', syncToken: token });

            this.closeImportSceneModal();
            this.renderInstanceList();
            this.selectInstance(newId);
            this.linkToAccount([this.instanceManager.instances[newId]]);
            UIHelpers.showNotification('Scene Linked', 'Loading settings from the cloud.');
        }

        // createInstance/duplicateCurrentInstance mint a syncToken but have no sync manager
        // access to push it — same atomicity requirement as ensureSyncTokenAndPush above.
        async pushFreshTokenToCloud(instance) {
            if (!instance || !instance.syncToken) return;
            const pushResult = await this.syncManager.pushToCloud(instance.syncToken, instance.config, instance.name);
            if (!pushResult.success) {
                UIHelpers.showNotification('Sync Pending', 'Scene saved locally. Cloud sync will retry on next save.', 'warning');
            }
        }

        // ---- Account (Twitch sign-in / cross-device scene sync) ----------------

        renderAccountUI({ status } = {}) {
            const plate = this.dom.accountPlate;
            if (!plate) return;

            if (!this.accountUser) {
                plate.classList.remove('account-plate--signed-in');
                const statusHtml = status
                    ? `<p class="account-status account-status--warning">${UIHelpers.escapeHtml(status)}</p>`
                    : '';
                plate.innerHTML = `
                    <p class="account-eyebrow">Scene list stored in</p>
                    <p class="account-value">This browser only</p>
                    <button type="button" class="btn btn-secondary account-signin" id="twitchLoginBtn"><svg class="lucide-inline" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg> Sign in with Twitch</button>
                    <p class="account-hint">Optional. Keeps your scenes on every computer you use.</p>
                    ${statusHtml}
                `;
            } else {
                plate.classList.add('account-plate--signed-in');
                const { displayName, avatarUrl } = this.accountUser;
                const avatarHtml = (typeof avatarUrl === 'string' && avatarUrl.startsWith('https://'))
                    ? `<img class="account-avatar" src="${UIHelpers.escapeHtml(avatarUrl)}" alt="" width="24" height="24">`
                    : `<span class="account-avatar account-avatar--empty" aria-hidden="true"></span>`;
                plate.innerHTML = `
                    <p class="account-eyebrow">Scene list stored in</p>
                    <div class="account-user">
                        ${avatarHtml}
                        <span class="account-name">${UIHelpers.escapeHtml(displayName)}</span>
                        <button type="button" class="account-signout" id="twitchLogoutBtn">Sign out</button>
                    </div>
                    <p class="account-status" id="accountStatus" aria-live="polite">${UIHelpers.escapeHtml(status || 'Twitch account · synced')}</p>
                `;
            }

            window.lucide?.createIcons();
        }

        /** Updates the status line in place, without tearing down and re-rendering the plate. */
        setAccountStatus(text, { warning = false } = {}) {
            const el = document.getElementById('accountStatus');
            if (!el) return;
            el.textContent = text;
            el.classList.toggle('account-status--warning', !!warning);
        }

        async initAccount(redirectResult) {
            if (redirectResult && (redirectResult.status === 'error' || redirectResult.status === 'state_mismatch')) {
                UIHelpers.showNotification('Sign-in failed', redirectResult.message, 'error');
            }

            // Paint whatever is cached immediately so there's no flash of "signed
            // out" while restoreSession() round-trips to Twitch.
            const cached = getCachedUser();
            if (cached) {
                this.accountUser = cached;
                this.renderAccountUI();
            }

            this.accountUser = await restoreSession();
            this.renderAccountUI();

            // Registered before the first sync so a 401 during that sync is not
            // misreported as "could not reach your account".
            window.addEventListener(AUTH_EXPIRED_EVENT, () => this.handleSessionExpired());

            if (this.accountUser) {
                if (redirectResult && redirectResult.status === 'ok') {
                    UIHelpers.showNotification('Signed in', `Signed in as ${this.accountUser.displayName}`);
                }
                await this.syncWithAccount({ announce: true });
                this._revalidateTimer = setInterval(() => this.revalidateSession(), 60 * 60 * 1000);
            }
        }

        async revalidateSession() {
            const user = await restoreSession();
            if (!user && this.accountUser) {
                this.handleSessionExpired();
            } else if (user) {
                this.accountUser = user;
            }
        }

        handleSessionExpired() {
            // The 401 event can fire after a deliberate sign-out; nothing to do then.
            if (!this.accountUser) return;
            clearSession();
            this.accountUser = null;
            this.accountTokens.clear();
            if (this._revalidateTimer) {
                clearInterval(this._revalidateTimer);
                this._revalidateTimer = null;
            }
            this.renderAccountUI();
            this.renderInstanceList();
            UIHelpers.showNotification('Twitch session expired', 'Sign in again to keep syncing your scene list.', 'warning');
        }

        async handleLogin() {
            const ok = await this.confirmSaveIfDirty('signing in');
            if (!ok) return;
            login();
        }

        async handleLogout() {
            await logout();
            this.accountUser = null;
            this.accountTokens.clear();
            if (this._revalidateTimer) {
                clearInterval(this._revalidateTimer);
                this._revalidateTimer = null;
            }
            this.renderAccountUI();
            this.renderInstanceList();
            UIHelpers.showNotification('Signed out', 'Your scenes stay in this browser.');
        }

        async syncWithAccount({ announce = false } = {}) {
            if (this._accountSyncInFlight) return;
            this._accountSyncInFlight = true;

            try {
                // Another tab may have written to localStorage since this tab last
                // read it. Re-reading is safe only while nothing here is unsaved —
                // an in-progress edit takes priority over a re-read.
                if (!this.isDirty) {
                    this.instanceManager.loadInstances();
                    const currentId = this.instanceManager.currentInstanceId;
                    if (currentId && !this.instanceManager.instances[currentId]) {
                        this.instanceManager.currentInstanceId = null;
                    }
                }

                this.setAccountStatus('Syncing…');
                const account = await fetchAccount();
                if (!account) {
                    this.setAccountStatus('Could not reach your account. Working locally.', { warning: true });
                    if (announce) {
                        UIHelpers.showNotification('Sync unavailable', 'Could not reach your account. Working locally.', 'warning');
                    }
                    return;
                }

                for (const id of [...this.instanceManager.instanceOrder]) {
                    await this.ensureSyncTokenAndPush(id);
                }
                // ensureSyncTokenAndPush rewrites the OBS URL panel for whichever
                // scene it minted for; put the selected scene's URL back.
                const selectedId = this.instanceManager.currentInstanceId;
                if (selectedId && this.instanceManager.instances[selectedId]) {
                    this.syncManager.updateInstanceUrl(this.instanceManager.instances[selectedId], selectedId, this.dom);
                }

                const accountTokenSet = new Set(account.scenes.map(s => s.token));
                const localToLink = Object.values(this.instanceManager.instances)
                    .filter(inst => inst.syncToken && !accountTokenSet.has(inst.syncToken));
                // No force: an account-side tombstone (a scene the user explicitly
                // unlinked elsewhere) must stay skipped on this automatic merge —
                // only an explicit user action re-links it.
                const result = await linkScenes(localToLink.map(i => ({ token: i.syncToken, name: i.name })));
                this.accountTokens = new Set([...accountTokenSet, ...(result?.linked || []), ...(result?.existing || [])]);
                const linkedCount = result?.linked?.length || 0;
                const skippedCount = result?.skipped?.length || 0;

                let addedFromAccount = 0;
                const localTokens = new Set(
                    Object.values(this.instanceManager.instances).map(i => i.syncToken).filter(Boolean)
                );
                for (const scene of account.scenes) {
                    if (!localTokens.has(scene.token)) {
                        this.instanceManager.createLinkedInstance({ name: scene.name, syncToken: scene.token, config: scene.config });
                        addedFromAccount++;
                    }
                }

                const tokenById = new Map(
                    this.instanceManager.instanceOrder.map(id => [id, this.instanceManager.instances[id]?.syncToken])
                );
                const { order, changed } = mergeSceneOrder(account.sceneOrder, this.instanceManager.instanceOrder, tokenById);
                this.instanceManager.instanceOrder = order;
                if (changed) {
                    const orderedTokens = order
                        .map(id => this.instanceManager.instances[id]?.syncToken)
                        .filter(token => token && this.accountTokens.has(token));
                    await setSceneOrder(orderedTokens);
                }

                this.instanceManager.saveInstances();
                this.renderInstanceList();

                if (!this.instanceManager.currentInstanceId && order.length > 0) {
                    this.selectInstance(order[0]);
                }

                this.setAccountStatus('Twitch account · synced');

                if (announce) {
                    const parts = [];
                    if (linkedCount > 0) parts.push(`${linkedCount} added to your account`);
                    if (addedFromAccount > 0) parts.push(`${addedFromAccount} added from your account`);
                    if (skippedCount > 0) parts.push(`${skippedCount} kept in this browser only`);
                    UIHelpers.showNotification(
                        'Scene list synced',
                        parts.length > 0 ? parts.join(' · ') : 'Scene list up to date'
                    );
                }
            } catch (err) {
                console.error('[SceneCreator] Account sync failed:', err);
                this.setAccountStatus('Sync failed. Working locally.', { warning: true });
            } finally {
                this._accountSyncInFlight = false;
            }
        }

        async linkToAccount(instances, { force = true } = {}) {
            if (!this.accountUser) return;
            const list = (instances || []).filter(inst => inst && inst.syncToken);
            if (list.length === 0) return;

            const r = await linkScenes(list.map(inst => ({ token: inst.syncToken, name: inst.name })), { force });
            if (r) {
                for (const token of [...(r.linked || []), ...(r.existing || [])]) {
                    this.accountTokens.add(token);
                }
                this.renderInstanceList();
            }
        }

        pushOrderToAccount() {
            if (!this.accountUser) return;
            if (this._orderPushTimer) clearTimeout(this._orderPushTimer);
            this._orderPushTimer = setTimeout(() => {
                this._orderPushTimer = null;
                const tokens = this.instanceManager.instanceOrder
                    .map(id => this.instanceManager.instances[id]?.syncToken)
                    .filter(token => token && this.accountTokens.has(token));
                setSceneOrder(tokens);
            }, 300);
        }

        setupEventListeners() {
            const handleFieldChange = () => this.setDirty(true);

            if (this.dom.instanceName) {
                this.dom.instanceName.addEventListener('input', handleFieldChange);
                this.dom.instanceName.addEventListener('change', handleFieldChange);
            }
            if (this.dom.creatorTwitchChannel) {
                this.dom.creatorTwitchChannel.addEventListener('input', handleFieldChange);
                this.dom.creatorTwitchChannel.addEventListener('change', handleFieldChange);
            }
            if (this.dom.creatorYoutubeTarget) {
                this.dom.creatorYoutubeTarget.addEventListener('input', handleFieldChange);
                this.dom.creatorYoutubeTarget.addEventListener('change', handleFieldChange);
            }

            window.addEventListener('beforeunload', (e) => {
                if (this.isDirty) {
                    e.preventDefault();
                    e.returnValue = '';
                }
            });

            if (this.dom.createInstanceBtn) {
                this.dom.createInstanceBtn.addEventListener('click', async () => {
                    const confirmed = await this.confirmSaveIfDirty('creating a new scene');
                    if (!confirmed) return;
                    this.instanceManager.openInstanceModal(this.dom.instanceModal, this.dom.modalInstanceName);
                });
            }
            if (this.dom.emptyStateCreateBtn) {
                this.dom.emptyStateCreateBtn.addEventListener('click', async () => {
                    const confirmed = await this.confirmSaveIfDirty('creating a new scene');
                    if (!confirmed) return;
                    this.instanceManager.openInstanceModal(this.dom.instanceModal, this.dom.modalInstanceName);
                });
            }
            if (this.dom.modalCancelBtn) {
                this.dom.modalCancelBtn.addEventListener('click', () => {
                    this.instanceManager.closeInstanceModal(this.dom.instanceModal);
                });
            }
            if (this.dom.modalCreateBtn) {
                this.dom.modalCreateBtn.addEventListener('click', async () => {
                    const newId = this.instanceManager.createInstance(this.dom.modalInstanceName.value);
                    this.instanceManager.closeInstanceModal(this.dom.instanceModal);
                    this.renderInstanceList();
                    await this.selectInstance(newId);
                    await this.pushFreshTokenToCloud(this.instanceManager.instances[newId]);
                    await this.linkToAccount([this.instanceManager.instances[newId]]);
                });
            }

            // Enter submits both dialogs. There is no <form> here — and adding one
            // would be a trap, since these buttons would default to type="submit" —
            // so route the key through the primary button's own handler.
            // Empty input is safe on both paths: createInstance() falls back to a
            // default name, and confirmImportScene() reports the error itself.
            // isComposing guards the IME case: Enter confirms a CJK composition and
            // must not also submit the dialog behind it.
            const submitOnEnter = (input, button) => {
                input?.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter') return;
                    if (e.isComposing || e.keyCode === 229) return;
                    e.preventDefault();
                    button?.click();
                });
            };
            submitOnEnter(this.dom.modalInstanceName, this.dom.modalCreateBtn);
            submitOnEnter(this.dom.importSceneToken, this.dom.importModalConfirmBtn);

            if (this.dom.saveSettingsBtn) this.dom.saveSettingsBtn.addEventListener('click', () => this.saveCurrentInstance({ includeChannel: false }));
            if (this.dom.applyChannelBtn) this.dom.applyChannelBtn.addEventListener('click', () => this.applyChannel());

            if (this.dom.duplicateBtn) {
                this.dom.duplicateBtn.addEventListener('click', async () => {
                    const confirmed = await this.confirmSaveIfDirty('duplicating this scene');
                    if (!confirmed) return;
                    const newId = this.instanceManager.duplicateCurrentInstance();
                    if (newId) {
                        this.renderInstanceList();
                        await this.selectInstance(newId);
                        await this.pushFreshTokenToCloud(this.instanceManager.instances[newId]);
                        await this.linkToAccount([this.instanceManager.instances[newId]]);
                    }
                });
            }

            if (this.dom.deleteBtn) {
                this.dom.deleteBtn.addEventListener('click', () => {
                    const currentId = this.instanceManager.currentInstanceId;
                    const currentInstance = currentId ? this.instanceManager.instances[currentId] : null;
                    // Captured before deleteCurrentInstance() runs — it deletes the
                    // instance, so this is the last point the token is reachable.
                    const token = currentInstance?.syncToken;
                    const confirmMessage = this.accountUser
                        ? `Delete "${currentInstance?.name}"? It will also be removed from your Twitch account's scene list. The OBS overlay keeps working until you remove the source.`
                        : undefined;

                    const deletedId = this.instanceManager.deleteCurrentInstance({ confirmMessage });
                    if (deletedId) {
                        // The cloud sceneConfigs doc is NOT deleted here — only the
                        // account's link to it, so the OBS source keeps working.
                        if (this.accountUser && token) {
                            this.accountTokens.delete(token);
                            unlinkScene(token);
                        }
                        this.renderInstanceList();
                        if (this.instanceManager.instanceOrder.length > 0) {
                            this.selectInstance(this.instanceManager.instanceOrder[0]);
                        } else {
                            this.instanceManager.showEmptyState(this.dom);
                        }
                    }
                });
            }

            if (this.dom.exportBtn) {
                this.dom.exportBtn.addEventListener('click', () => {
                    const instance = this.instanceManager.instances[this.instanceManager.currentInstanceId];
                    if (instance) CreatorIOManager.exportInstance(instance);
                });
            }

            if (this.dom.exportAllBtn) {
                this.dom.exportAllBtn.addEventListener('click', () => {
                    CreatorIOManager.exportAllInstances(this.instanceManager.instances, this.instanceManager.instanceOrder);
                });
            }

            if (this.dom.importBtn) {
                this.dom.importBtn.addEventListener('click', async () => {
                    const confirmed = await this.confirmSaveIfDirty('importing scenes');
                    if (!confirmed) return;
                    CreatorIOManager.importInstanceFile(
                        async (parsed) => {
                            let importedCount = 0;
                            // Instances touched by this import, and the subset of
                            // those that had no syncToken in the file (so a token
                            // was just minted here and has never been pushed).
                            const importedInstances = [];
                            const minted = [];
                            if (parsed.instances && parsed.instanceOrder) {
                                for (const id of Object.keys(parsed.instances)) {
                                    const rawInstance = parsed.instances[id];
                                    if (rawInstance && rawInstance.config) {
                                        const { config: safeConfig } = migrateConfig(rawInstance.config, this.configManagerHelper.getDefaultConfig());
                                        const instance = {
                                            id: String(rawInstance.id || id),
                                            name: String(rawInstance.name || 'Imported Scene').trim() || 'Imported Scene',
                                            config: safeConfig,
                                            createdAt: String(rawInstance.createdAt || new Date().toISOString()),
                                            lastModified: new Date().toISOString(),
                                            syncToken: rawInstance.syncToken ? String(rawInstance.syncToken) : this.instanceManager.mintSyncToken()
                                        };
                                        this.instanceManager.instances[id] = instance;
                                        importedInstances.push(instance);
                                        if (!rawInstance.syncToken) minted.push(instance);
                                    }
                                }
                                parsed.instanceOrder.forEach(id => {
                                    const safeId = String(id);
                                    if (!this.instanceManager.instanceOrder.includes(safeId) && this.instanceManager.instances[safeId]) {
                                        this.instanceManager.instanceOrder.push(safeId);
                                    }
                                });
                                importedCount = Object.keys(parsed.instances).length;
                            } else if (parsed.id && parsed.name && parsed.config) {
                                const newId = UIHelpers.generateSecureId('scene');
                                const { config: safeConfig } = migrateConfig(parsed.config, this.configManagerHelper.getDefaultConfig());
                                const instance = {
                                    id: newId,
                                    name: String(parsed.name).trim() || 'Imported Scene',
                                    config: safeConfig,
                                    createdAt: String(parsed.createdAt || new Date().toISOString()),
                                    lastModified: new Date().toISOString(),
                                    syncToken: parsed.syncToken ? String(parsed.syncToken) : this.instanceManager.mintSyncToken()
                                };
                                this.instanceManager.instances[newId] = instance;
                                this.instanceManager.instanceOrder.push(newId);
                                importedInstances.push(instance);
                                if (!parsed.syncToken) minted.push(instance);
                                importedCount = 1;
                            } else {
                                UIHelpers.showNotification('Import Failed', 'The JSON file does not match the scene configuration format.', 'error');
                                return;
                            }
                            this.instanceManager.saveInstances();
                            this.renderInstanceList();
                            UIHelpers.showNotification('Imported', importedCount > 1 ? `Imported ${importedCount} chat scenes.` : 'Imported 1 chat scene.');

                            // Freshly minted tokens must be pushed before the scene can be
                            // shared or linked, same atomicity requirement as elsewhere.
                            await Promise.allSettled(minted.map(i => this.pushFreshTokenToCloud(i)));
                            await this.linkToAccount(importedInstances);
                        },
                        (err) => UIHelpers.showNotification('Import Failed', 'Invalid JSON file.', 'error')
                    );
                });
            }

            const toggleObsSetupBtn = document.getElementById('toggleObsSetupBtn');
            if (toggleObsSetupBtn) {
                toggleObsSetupBtn.addEventListener('click', () => {
                    if (this.dom.obsSetup.style.display === 'none') {
                        this.dom.obsSetup.style.display = 'block';
                        toggleObsSetupBtn.innerHTML = '<i data-lucide="eye-off" class="lucide-inline"></i> Hide OBS Setup Instructions';
                    } else {
                        this.dom.obsSetup.style.display = 'none';
                        toggleObsSetupBtn.innerHTML = '<i data-lucide="monitor" class="lucide-inline"></i> Detailed OBS Setup Instructions';
                    }
                    if (window.lucide) window.lucide.createIcons();
                });
            }

            if (this.dom.copySyncTokenBtn) {
                this.dom.copySyncTokenBtn.addEventListener('click', () => {
                    const token = this.dom.syncTokenDisplay?.value || '';
                    if (token) CreatorIOManager.copyUrl(token);
                });
            }
            if (this.dom.copyUrlBtnConfig) {
                this.dom.copyUrlBtnConfig.addEventListener('click', () => CreatorIOManager.copyUrl(this.dom.instanceUrlConfig.textContent));
            }
            if (this.dom.copyUrlBtnSetup) {
                this.dom.copyUrlBtnSetup.addEventListener('click', () => CreatorIOManager.copyUrl(this.dom.instanceUrlSetup.textContent));
            }

            if (this.dom.instanceModal) {
                this.dom.instanceModal.addEventListener('click', (e) => {
                    if (e.target === this.dom.instanceModal) {
                        this.instanceManager.closeInstanceModal(this.dom.instanceModal);
                    }
                });
            }

            if (this.dom.importSceneBtn) {
                this.dom.importSceneBtn.addEventListener('click', async () => {
                    const confirmed = await this.confirmSaveIfDirty('linking a scene');
                    if (!confirmed) return;
                    this.importScene();
                });
            }
            if (this.dom.importModalCancelBtn) this.dom.importModalCancelBtn.addEventListener('click', () => this.closeImportSceneModal());
            if (this.dom.importModalConfirmBtn) this.dom.importModalConfirmBtn.addEventListener('click', () => this.confirmImportScene());
            if (this.dom.importSceneModal) {
                this.dom.importSceneModal.addEventListener('click', (e) => {
                    if (e.target === this.dom.importSceneModal) {
                        this.closeImportSceneModal();
                    }
                });
            }
        }

        setupPreviewBgSelector() {
            const container = this.dom.previewIframeContainer;
            const btns = this.dom.previewBgBtns;
            const colorInput = this.dom.previewBgColorInput;
            const customSwatch = this.dom.previewCustomSwatch;

            if (!container || !btns || !btns.length || !colorInput) return;

            const STORAGE_KEY = 'chat_overlay_preview_bg';

            const getSavedBg = () => {
                try {
                    const saved = localStorage.getItem(STORAGE_KEY);
                    return saved ? JSON.parse(saved) : { type: 'checkerboard', color: '#121212' };
                } catch (e) {
                    return { type: 'checkerboard', color: '#121212' };
                }
            };

            const saveBg = (bgState) => {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(bgState));
                } catch (e) {
                    // silent fallback
                }
            };

            let currentBg = getSavedBg();
            if (colorInput && currentBg.color) {
                colorInput.value = currentBg.color;
                if (customSwatch) customSwatch.style.background = currentBg.color;
            }

            const applyBg = (type, customColor) => {
                container.classList.remove('bg-checkerboard');
                container.style.backgroundImage = '';

                if (type === 'dark') {
                    container.style.backgroundColor = '#000000';
                } else if (type === 'light') {
                    container.style.backgroundColor = '#ffffff';
                } else if (type === 'custom') {
                    const hex = customColor || colorInput.value || '#121212';
                    container.style.backgroundColor = hex;
                    if (customSwatch) customSwatch.style.background = hex;
                } else {
                    type = 'checkerboard';
                    container.classList.add('bg-checkerboard');
                }

                btns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.bgType === type);
                });

                currentBg = { type, color: colorInput.value };
                saveBg(currentBg);
            };

            btns.forEach(btn => {
                const type = btn.dataset.bgType;
                if (type !== 'custom') {
                    btn.addEventListener('click', () => applyBg(type));
                }
            });

            if (colorInput) {
                const handleCustomInput = (e) => {
                    const hex = e.target.value;
                    if (customSwatch) customSwatch.style.background = hex;
                    applyBg('custom', hex);
                };
                colorInput.addEventListener('input', handleCustomInput);
                colorInput.addEventListener('change', handleCustomInput);
                colorInput.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyBg('custom', colorInput.value);
                });
            }

            applyBg(currentBg.type, currentBg.color);
        }
    }

    window.chatSceneCreatorApp = new ChatSceneCreatorApp();
});

