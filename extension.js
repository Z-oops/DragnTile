/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';
import GdkPixbuf from 'gi://GdkPixbuf';
import Cogl from 'gi://Cogl';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ControlsState } from 'resource:///org/gnome/shell/ui/overviewControls.js';
import { WindowPreview } from 'resource:///org/gnome/shell/ui/windowPreview.js';
import * as Screenshot from 'resource:///org/gnome/shell/ui/screenshot.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const WINDOW_ANIMATION_TIME = 250;

class DesktopPreview {
    constructor() {
        this._previewBox = null;
        this._textureCache = St.TextureCache.get_default();
        this._screenshot = new Shell.Screenshot();
        this._showId = null;
        this._fakeMetaWindow = null;
        console.log('[DesktopPreview] Constructor called - initialized');
    }

    static get TILE_SNAPSHOT() {
        return GLib.build_filenamev([GLib.get_user_cache_dir(), `DragnTile.snapshot.png`])
    }

    _createFakeMetaWindow() {
        console.log('[DesktopPreview] Creating fake metaWindow');
        return {
            get_stable_sequence: () => 999999,
            showing_on_its_workspace: () => true,
            connect: () => 0,
            disconnect: () => {},
            get_monitor: () => 0,
            get_workspace: () => null,
            get_frame_rect: () => ({x: 0, y: 0, width: 320, height: 180}),
            get_buffer_rect: () => ({x: 0, y: 0, width: 320, height: 180}),
            get_id: () => -1,
            get_title: () => 'Desktop Preview',
            is_hidden: () => false,
        };
    }

    async captureWorkArea() {
        try {
            const workArea = Utils.getMonitorWorkarea();

            const savePath = GLib.build_filenamev([GLib.get_user_cache_dir(), `DragnTile.snapshot.png`]);
            const file = Gio.File.new_for_path(savePath);
            const outputStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);

            const screenshot = new Shell.Screenshot();
            return new Promise((resolve, reject) => {
                //  (x, y, width, height, stream, callback)
                screenshot.screenshot_area(
                    workArea.x,
                    workArea.y,
                    workArea.width,
                    workArea.height,
                    outputStream,
                    (obj, res) => {
                        try {
                            outputStream.close(null);
                            resolve(savePath);
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
        } catch (err) {
            console.error('captureWorkArea failed', err);
            return Promise.reject("captureWorkArea failed");
        }
    }

    _createPreviewUI() {
        console.log('[DesktopPreview] _createPreviewUI() called');
        console.log('[DesktopPreview] Screenshot path:', this.TILE_SNAPSHOT);

        try {
            console.log('[DesktopPreview] Creating preview actor');

            // Create a container actor with necessary properties
            //const actor = new Clutter.Actor({
            const actor = new St.Bin({
                name: 'DesktopPreviewActor',
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                //layout_manager: new Clutter.BinLayout(),
                // reactive: true,
                // x_expand: true,
                // y_expand: true,
            });

            // Set a reasonable initial size
            //actor.set_size(1080, 720);
            console.log('[DesktopPreview] Actor initial size set to 1080x720');

            // Add all properties and methods that WorkspaceLayout expects
            console.log('[DesktopPreview] Adding WorkspaceLayout-compatible interface');

            this._fakeMetaWindow = this._createFakeMetaWindow();

            actor.chromeHeights = function() {
                return [0, 0];
            };

            actor.chromeWidths = function() {
                return [0, 0];
            };

            actor.overlapHeights = function() {
                return [0, 0];
            };

            const workarea = Utils.getMonitorWorkarea();
            actor.boundingBox = {
                x: 0,
                y: 0,
                width: workarea.width,
                height: workarea.height,
            };

            actor.windowCenter = {
                x: 0,
                y: 0,
            };

            actor.visible = true;
            actor.metaWindow = this._fakeMetaWindow;

            // Create a container for styling
            const container = new St.BoxLayout({
                vertical: false,
                x: 0,
                y: 0,
                width: workarea.width,
                height: workarea.height,
                content_gravity: Clutter.ContentGravity.RESIZE_ASPECT,
                // x_align: Clutter.ActorAlign.CENTER,
                // y_align: Clutter.ActorAlign.CENTER,
            });

            console.log('[DesktopPreview] Container created');

            try {
                console.log('[DesktopPreview] Creating St.Picture for preview', this.TILE_SNAPSHOT);
                const pixbuf = GdkPixbuf.Pixbuf.new_from_file('/home/fuzzylogic/.cache/DragnTile.snapshot.png');
                const w = pixbuf.get_width();
                const h = pixbuf.get_height();

                const imageContent = St.ImageContent.new_with_preferred_size(w, h);
                const coglContext = Clutter.get_default_backend().get_cogl_context();
                imageContent.set_data(
                    coglContext,
                    pixbuf.get_pixels(),
                    pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
                    w,
                    h,
                    pixbuf.get_rowstride()
                );

                console.log('[DesktopPreview] Picture loaded from screenshot');
                const pictureActor = new Clutter.Actor({
                    content: imageContent,
                    // width: w,
                    // height: h,
                    x_expand: true,
                    y_expand: true,
                });

                container.add_child(pictureActor);
            } catch (iconError) {
                console.warn('[DesktopPreview] Icon creation failed:', iconError);

                // Fallback to text label
                const label = new St.Label({
                    text: '📸 Desktop',
                    style_class: 'dragnTile-desktop-preview-text',
                });
                container.add_child(label);
                console.log('[DesktopPreview] Using fallback label');
            }

            actor.add_child(container);
            console.log('[DesktopPreview] Preview actor created successfully');
            console.log('[DesktopPreview] Actor actual size:', actor.get_size());

            this._previewBox = actor;
            return actor;
        } catch (error) {
            console.error('[DesktopPreview] Error creating preview UI:', error);
            console.error('[DesktopPreview] UI error message:', error.message);
            return null;
        }
    }

    async show() {
        try {
            console.log('[DesktopPreview] show() - START');

            // Capture screenshot
            await this.captureWorkArea();
            // Create preview UI
            const previewUI = this._createPreviewUI();
            console.log('[DesktopPreview] show() - Preview UI created:', previewUI);

            if (!previewUI) {
                console.warn('[DesktopPreview] show() - Failed to create preview UI');
                return;
            }

            let added = false;

            // Try to find the Workspace object and add to its _container
            // This is the container that holds window previews
            try {
                console.log('[DesktopPreview] show() - Searching for Workspace');

                if (!Main.overview?._overview?.controls?._workspacesDisplay) {
                    console.warn('[DesktopPreview] show() - workspacesDisplay not found');
                    throw new Error('workspacesDisplay is null');
                }

                const display = Main.overview._overview.controls._workspacesDisplay;
                console.log('[DesktopPreview] show() - WorkspacesDisplay found');
                console.log('[DesktopPreview] show() - _workspacesViews length:', display._workspacesViews?.length);

                // Get the active workspace index
                const workspaceManager = global.workspace_manager;
                const activeIndex = workspaceManager.get_active_workspace_index();
                console.log('[DesktopPreview] show() - Active workspace index:', activeIndex);

                // Get the WorkspacesView for the primary monitor (where the active workspace is shown)
                if (!display._workspacesViews || display._workspacesViews.length === 0) {
                    console.warn('[DesktopPreview] show() - No workspaces views found');
                    throw new Error('WorkspacesViews is empty');
                }

                // Get the first WorkspacesView (primary monitor)
                const workspacesView = display._workspacesViews[0];
                console.log('[DesktopPreview] show() - WorkspacesView found');
                console.log('[DesktopPreview] show() - workspacesView._workspaces length:', workspacesView._workspaces?.length);

                // Now get the specific workspace from the WorkspacesView
                if (!workspacesView._workspaces || !workspacesView._workspaces[activeIndex]) {
                    console.warn('[DesktopPreview] show() - Workspace not found at index:', activeIndex);
                    throw new Error('Workspace not found in WorkspacesView');
                }

                const workspace = workspacesView._workspaces[activeIndex];
                console.log('[DesktopPreview] show() - Workspace found');

                // Add to the workspace's own _container via the layout manager
                // The _container has a WorkspaceLayout which needs to know about our preview
                if (workspace._container) {
                    console.log('[DesktopPreview] show() - Found workspace._container');

                    // Call addWindow on the layout manager to properly register the preview
                    const layoutManager = workspace._container.layout_manager;
                    console.log('[DesktopPreview] show() - Layout manager type:', layoutManager.constructor.name);

                    if (layoutManager && layoutManager.addWindow) {
                        console.log('[DesktopPreview] show() - Calling layoutManager.addWindow()');
                        console.log('[DesktopPreview] show() - previewUI size before addWindow:', previewUI.get_size());
                        console.log('[DesktopPreview] show() - previewUI visible:', previewUI.visible);

                        // Create a fake metaWindow object for the layout manager
                        const fakeMetaWindow = {
                            get_stable_sequence: () => 999999, // High sequence to put it last
                            showing_on_its_workspace: () => true,
                            connect: () => 0, // Return a signal ID
                            disconnect: () => {},
                        };
                        layoutManager.addWindow(previewUI, fakeMetaWindow);
                        console.log('[DesktopPreview] show() - Successfully added via layoutManager.addWindow()');
                        console.log('[DesktopPreview] show() - previewUI size after addWindow:', previewUI.get_size());
                        console.log('[DesktopPreview] show() - Number of windows in layout:', layoutManager._windows?.size || 'unknown');
                        added = true;
                    } else {
                        console.log('[DesktopPreview] show() - Layout manager does not have addWindow, adding directly');
                        workspace._container.add_child(previewUI);
                        console.log('[DesktopPreview] show() - Added directly to workspace._container');
                        added = true;
                    }
                } else {
                    console.warn('[DesktopPreview] show() - workspace._container not found');
                }
            } catch (error) {
                console.warn('[DesktopPreview] show() - Error finding workspace container:', error);
                console.error('[DesktopPreview] show() - Error details:', error.message);
            }

            // Fallback: try the overview content
            if (!added) {
                try {
                    console.log('[DesktopPreview] show() - Trying overview content fallback');
                    if (Main.overview._overview?.content) {
                        Main.overview._overview.content.add_child(previewUI);
                        console.log('[DesktopPreview] show() - Added to overview.content');
                        added = true;
                    }
                } catch (error) {
                    console.warn('[DesktopPreview] show() - Fallback failed:', error);
                }
            }

            // Last resort: add to uiGroup
            if (!added) {
                try {
                    console.log('[DesktopPreview] show() - Last resort: adding to Main.uiGroup');
                    Main.uiGroup.add_child(previewUI);
                    console.log('[DesktopPreview] show() - Added to Main.uiGroup');
                    added = true;
                } catch (error) {
                    console.error('[DesktopPreview] show() - All attempts failed:', error);
                }
            }

            console.log('[DesktopPreview] show() - END, added:', added);

        } catch (error) {
            console.error('[DesktopPreview] show() - Unexpected error:', error);
            console.error('[DesktopPreview] show() - Stack:', error.stack);
        }
    }

    hide() {
        console.log('[DesktopPreview] hide() called');
        if (this._previewBox) {
            try {
                console.log('[DesktopPreview] Destroying preview box');
                // Try to remove from parent first if it has one
                if (this._previewBox.get_parent()) {
                    this._previewBox.get_parent().remove_child(this._previewBox);
                }
                this._previewBox.destroy();
                console.log('[DesktopPreview] Preview box destroyed');
            } catch (e) {
                console.warn('[DesktopPreview] Error destroying preview box:', e);
            } finally {
                this._previewBox = null;
            }
        } else {
            console.log('[DesktopPreview] No preview box to hide');
        }
    }

    destroy() {
        console.log('[DesktopPreview] destroy() called');
        this.hide();
        this._screenshot = null;
        if (this.TILE_SNAPSHOT) {
            try {
                console.log('[DesktopPreview] Deleting screenshot file:', this.TILE_SNAPSHOT);
                Gio.File.new_for_path(this.TILE_SNAPSHOT).delete(null);
                console.log('[DesktopPreview] Screenshot file deleted');
            } catch (e) {
                console.warn('[DesktopPreview] Error deleting screenshot file:', e);
            }
            this.TILE_SNAPSHOT = null;
        }
        console.log('[DesktopPreview] destroy() completed');
    }
}

class TileLayout {
    constructor() {
        this._windows = [];
        this._gap = 2;
        this.around = false;
        this._tile = "none";
        this._nextTile = "none"
        this._savedWindowRects = new Map();
    }

    isManaged(window) {
        return this._windows.filter(win => win === window).length !== 0;
    }

    add(metaWindow) {
        this._windows = this._windows.filter(win => win !== metaWindow);
        this._windows.push(metaWindow);
    }

    getTileWorkarea() {
        let workarea = Utils.getMonitorWorkarea();
        let edgeGap = this.around ? this._gap : 0;
        return new Mtk.Rectangle({
                    x: workarea.x + edgeGap,
                    y: workarea.y + edgeGap,
                    width: workarea.width - 2 * edgeGap,
                    height: workarea.height - 2 * edgeGap
                });
    }

    relayout() {
        //console.log(new Error().stack);
        if (this._nextTile === "none") return;

        // it only supports two windows now
        if (this._windows.length !== 2) return;
        if (global.get_window_actors().find(actor => this._windows[0] === actor.get_meta_window()) === undefined) return;
        if (global.get_window_actors().find(actor => this._windows[1] === actor.get_meta_window()) === undefined) return;

        let focus = this._windows.find(win => win.has_focus());
        let other = this._windows.find(win => win !== focus);
        if (focus === undefined || other === undefined) return;

        let workarea = this.getTileWorkarea();
        let focusRect = focus.get_frame_rect();
        let otherRect = other.get_frame_rect();
        const gap = this._gap;

        if (this._tile !== this._nextTile) {
            this._tile = this._nextTile;
            focus.raise();
            other.raise();
            if (this._tile === 'SLTR') {
                // source left target right
                focusRect = new Mtk.Rectangle({
                    x: workarea.x, y: workarea.y, width: (workarea.width - gap) / 2, height: workarea.height});
            } else if (this._tile === 'TLSR') {
                focusRect = new Mtk.Rectangle({
                    x: workarea.x + workarea.width / 2 + gap / 2, y: workarea.y, width: (workarea.width - gap) / 2, height: workarea.height});
            } else if (this._tile === 'STTB') {
                // source top target bottom
                focusRect = new Mtk.Rectangle({
                    x: workarea.x, y: workarea.y, width: workarea.width, height: (workarea.height - gap) / 2});
            } else if (this._tile === 'TTSB') {
                focusRect = new Mtk.Rectangle({
                    x: workarea.x, y: workarea.y + workarea.height / 2 + gap / 2, width: workarea.width, height: (workarea.height - gap) / 2});
            }
        }

        if (focusRect.width !== workarea.width) {
            const otherX = focusRect.x > workarea.x ? workarea.x : focusRect.x + focusRect.width + gap;
            otherRect = new Mtk.Rectangle({
                x: otherX, y: workarea.y, width: workarea.width - focusRect.width - gap, height: workarea.height});
        } else {
            const otherY = focusRect.y > workarea.y ? workarea.y : focusRect.y + focusRect.height + gap;
            otherRect = new Mtk.Rectangle({
                x: workarea.x, y: otherY, width: workarea.width, height: workarea.height - focusRect.height - gap});
        }

        focus.move_frame(true, focusRect.x, focusRect.y);
        focus.move_resize_frame(true, focusRect.x, focusRect.y, focusRect.width, focusRect.height);
        other.move_frame(true, otherRect.x, otherRect.y);
        other.move_resize_frame(true, otherRect.x, otherRect.y, otherRect.width, otherRect.height);

        Utils.log('focus:', focus.get_title(), focusRect.x, focusRect.y, focusRect.width, focusRect.height,
            'other:', other.get_title(), otherRect.x, otherRect.y, otherRect.width, otherRect.height);
    }

    clear(clearSavedRects) {
        this._windows = [];
        this._tile = "none";
        this._nextTile = "none"
        if (clearSavedRects)
            this._savedWindowRects.clear();
    }

    setGap(gap) {
        this._gap = gap;
    }

    setAround(around) {
        this.around = around;
    }

    setTile(tile) {
        this._nextTile = tile;
    }

    saveWindowRect(metaWindow) {
        const id = metaWindow.get_id();
        if (this._savedWindowRects.has(id)) return;

        this._savedWindowRects.set(id, metaWindow.get_frame_rect());
    }

    restoreWindowRect(id) {
        const rect = this._savedWindowRects.get(id);
        if (rect === undefined) return;
        this._savedWindowRects.delete(id);

        Utils.getMetaWindow(id)?.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
    }
}

class Utils {
    static log(...args) {
        if (DragnTileExtension._debug) {
            console.log(...args);
        }
    }

    static unmaximize(metaWindow) {
        if (metaWindow.set_unmaximize_flags === undefined) {
            // <= gnome48
            metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
        } else {
            metaWindow.set_unmaximize_flags(Meta.MaximizeFlags.BOTH);
        }
    }

    static getMonitorWorkarea() {
        const monitorIndex = global.display.get_current_monitor();
        return Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    }

    static getMetaWindow(id) {
        return global.get_window_actors().find(actor => id === actor.get_meta_window().get_id())?.get_meta_window();
    }

    static minimizeMetaWindows(excludes) {
        global.get_window_actors().forEach(actor => {
                if (!excludes.includes(actor.get_meta_window().get_id())) actor.get_meta_window().minimize();
            });
    }
}

export default class DragnTileExtension extends Extension {
    enable() {
        this._dragMonitor = {
            dragDrop: this._onDragDrop.bind(this),
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        this._tileTip = new St.Widget({
            name: 'DragnTileTip',
            style_class: 'tile-preview',
            opacity: 0,
        });

        this._tile = 'none';
        this._dropId = undefined;
        this._targetId = undefined;

        this._sizechangeId = new Map();
        this._positionChangeIds = new Map();
        this._layoutManager = new TileLayout();

        // Create a new GSettings object
        this._settings = this.getSettings();

        this._debug = this._settings.get_value('debug');
        // Watch for changes to a specific setting
        this._settings.connect('changed::debug', (settings, key) => {
            this._debug = settings.get_value(key);
            console.log('DragnTileExtension.settings', `${key} = ${settings.get_value(key).print(true)}`);
        });

        this._gap = this._settings.get_value('window-gap').get_int32();
        this._settings.connect('changed::window-gap', (settings, key) => {
            this._gap = settings.get_value(key).get_int32();
            this._layoutManager.setGap(this._gap);
            this._layoutManager.relayout();
            console.log('DragnTileExtension.settings', `${key} = ${settings.get_value(key).print(true)}`);
        });

        this.around = this._settings.get_value('around').get_boolean();
        this._settings.connect('changed::around', (settings, key) => {
            this.around = settings.get_value(key).get_boolean();
            this._layoutManager.setAround(this.around);
            this._layoutManager.relayout();
            console.log('DragnTileExtension.settings', `${key} = ${settings.get_value(key).print(true)}`);
        });

        this._layoutManager.setGap(this._gap);
        this._layoutManager.setAround(this.around);

        // Initialize desktop preview
        console.log('[DragnTileExtension] Initializing DesktopPreview');
        this._desktopPreview = new DesktopPreview();

        const stateAdjustment = Main.overview._overview._controls._stateAdjustment;
        this.overviewStateAdjId = stateAdjustment.connect('notify::value', (adj) => {
            if (adj.value === ControlsState.WINDOW_PICKER) {
                this._desktopPreview.show();
            } else {
                this._desktopPreview.hide();
            }
        });
    }

    disable() {
        console.log('[DragnTileExtension] disable() called');
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = undefined;
        this._settings = null;
        this._layoutManager = null;

        this._tileTip.destroy();
        this._tileTip = null;
        this.tryDisconnect(this.timeoutId);
        this.tryDisconnect(this.overviewStateAdjId);

        // Cleanup desktop preview resources
        if (this._desktopPreview) {
            console.log('[DragnTileExtension] Cleaning up desktop preview');
            this._desktopPreview.destroy();
            this._desktopPreview = null;
        }

        // Disconnect overview events
        if (this._overviewShownId) {
            console.log('[DragnTileExtension] Disconnecting overview shown event, id:', this._overviewShownId);
            Main.overview.disconnect(this._overviewShownId);
            this._overviewShownId = null;
        }
        if (this._overviewHiddenId) {
            console.log('[DragnTileExtension] Disconnecting overview hidden event, id:', this._overviewHiddenId);
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }
        console.log('[DragnTileExtension] disable() completed');
    }

    _onDragDrop(event) {
        // clear extension states when drag and drop
        this._tileTip.hide();

        // if not a WindowPreview on top of DragnTileTip
        if (Main.overview._shownState !== 'SHOWN'
            || this._tile === 'none'
            || !(event.dropActor instanceof WindowPreview)
            || event.targetActor.get_name() !== "DragnTileTip"
            || Utils.getMetaWindow(this._dropId) === undefined
            || Utils.getMetaWindow(this._targetId) === undefined)
            return DND.DragDropResult.CONTINUE;
        Utils.log('DragnTileExtension.upon-app ', Utils.getMetaWindow(this._dropId).get_title(),
            ' on ', Utils.getMetaWindow(this._targetId).get_title());

        // hide other windows
        Utils.minimizeMetaWindows([this._dropId, this._targetId]);

        this._hiddenId = Main.overview.connect('hidden', this.enterTile.bind(this));
        // active a window to quit overview
        event.dropActor._activate();
        // make windows moveable and resizeable
        Utils.unmaximize(Utils.getMetaWindow(this._dropId));
        Utils.unmaximize(Utils.getMetaWindow(this._targetId));
        Utils.getMetaWindow(this._dropId).unminimize();
        Utils.getMetaWindow(this._targetId).unminimize();

        // wait for complete of the window animation
        this.tryDisconnect(this.timeoutId);
        this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this.registerWindowEvent();
            this.timeoutId = undefined;
            return GLib.SOURCE_REMOVE;
        });
        return DND.DragDropResult.CONTINUE;
    }

    tryDisconnect(timerId) {
        if (timerId) GLib.Source.remove(timerId);
    }

    registerWindowEvent() {
        const dropWindow = Utils.getMetaWindow(this._dropId);
        const targetWindow = Utils.getMetaWindow(this._targetId);
        if (dropWindow === undefined || targetWindow === undefined) return;

        // quit tile state when window position changes
        this._positionChangeIds.set(this._dropId, dropWindow.connect('position-changed', this.checkQuitTile.bind(this)));
        this._positionChangeIds.set(this._targetId, targetWindow.connect('position-changed', this.checkQuitTile.bind(this)));
        // change other windows' size after a window is changed
        this._sizechangeId.set(this._dropId, dropWindow.connect('size-changed', this.sizeChangedWindow.bind(this)));
        this._sizechangeId.set(this._targetId, targetWindow.connect('size-changed', this.sizeChangedWindow.bind(this)));
    }

    enterTile() {
        const dropWindow = Utils.getMetaWindow(this._dropId);
        const targetWindow = Utils.getMetaWindow(this._targetId);
        if (dropWindow === undefined || targetWindow === undefined) return;

        this._layoutManager.clear(false);
        this._layoutManager.add(dropWindow);
        this._layoutManager.add(targetWindow);
        this._layoutManager.saveWindowRect(dropWindow);
        this._layoutManager.saveWindowRect(targetWindow);
        this._layoutManager.setTile(this._tile);

        this._layoutManager.relayout();
        // we only need notified once
        Main.overview.disconnect(this._hiddenId);
    }

    checkQuitTile(triggerWindow) {
        const workarea = this._layoutManager.getTileWorkarea();
        const wf = triggerWindow.get_frame_rect();
        // it doesn't quit tiling
        if (wf.x === workarea.x || wf.y === workarea.y) return;

        this._positionChangeIds.forEach((value, key, map) => {
            Utils.getMetaWindow(key)?.disconnect(value);
        });
        this._positionChangeIds.clear(true);

        this._sizechangeId.forEach((value, key, map) => {
            Utils.getMetaWindow(key)?.disconnect(value);
        });
        this._sizechangeId.clear();

        this._layoutManager.restoreWindowRect(this._dropId);
        this._layoutManager.restoreWindowRect(this._targetId);
        this._layoutManager.clear();

        this._tile = 'none';
    }

    _onDragMotion(event) {
        if (Main.overview._shownState !== 'SHOWN') return DND.DragMotionResult.CONTINUE;

        let source = event.source;
        if (!(source instanceof WindowPreview)) {
            return DND.DragMotionResult.CONTINUE;
        }

        // if drag point intersects any WindowPreview
        let { tile: tile, preview: targetPreview } = this._getWindowTile(source._workspace, event);
        let tileChanged = !(this._tile === tile);
        this._tile = tile;
        if (this._tile === 'none') {
            this._tileTip.hide();
            return DND.DragMotionResult.CONTINUE;
        }
        this._dropId = source.metaWindow.get_id();
        this._targetId = targetPreview.metaWindow.get_id();

        Utils.log('DragnTileExtension.drag', source.get_name(),
            ', point', event.x, event.y,
            ', Preview', targetPreview?.get_name(),
            ', tilemode', this._tile);


        if (tileChanged) {
            const target = targetPreview;
            let dstBound = undefined;
            const topleft = new Graphene.Point3D({x: 0, y: 0});
            const rightbottom = new Graphene.Point3D({x: target.get_width(), y: target.get_height()});
            // translate to screen coordinate
            let {x: left, y: top} = target.apply_transform_to_point(topleft);
            let {x: right, y: bottom} = target.apply_transform_to_point(rightbottom);

            if (this._tile === 'SLTR') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top,
                    width: (right - left) / 2,
                    height: (bottom - top)});
            } else if (this._tile === 'TLSR') {
                dstBound = new Mtk.Rectangle({
                    x: left + (right - left) / 2,
                    y: top,
                    width: (right - left) / 2,
                    height: (bottom - top)});
            } else if (this._tile === 'STTB') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top,
                    width: (right - left),
                    height: (bottom - top) / 2});
            } else if (this._tile === 'TTSB') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top + (bottom - top) / 2,
                    width: (right - left),
                    height: (bottom - top) / 2});
            }
            Utils.log('DragnTileExtension.drag: dst', dstBound?.x, dstBound?.y, dstBound?.width, dstBound?.height);

            this._tileTip.set_position(left, top);
            this._tileTip.set_size(right - left, bottom - top);
            // TODO: Here set_child we meets an error message. It seems harmless but fix it later
            Main.uiGroup.add_child(this._tileTip);
            Main.uiGroup.set_child_above_sibling(this._tileTip, null);
            // put dnd on top of tileTip
            if (source._draggable && source._draggable._dragActor) {
                Main.uiGroup.set_child_above_sibling(source._draggable._dragActor, null);
            }

            this._tileTip.show();
            this._tileTip.ease({
                x: dstBound.x,
                y: dstBound.y,
                width: dstBound.width,
                height: dstBound.height,
                opacity: 255,
                duration: WINDOW_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            Utils.log('DragnTileExtension.drag tiletip bounds', dstBound.x, dstBound.y, dstBound.width, dstBound.height);
        }

        // always listen dragmotion event
        return DND.DragMotionResult.CONTINUE;
    }

    _getWindowTile(workspace, event) {
        let source = event.source;
        let ret = {tile: 'none', preview: undefined};
        // TODO: maybe peek actors at point?
        for (const window of workspace._windows) {
            if (window instanceof WindowPreview && window !== source) {
                const topleft = new Graphene.Point3D({x: 0, y: 0});
                const rightbottom = new Graphene.Point3D({x: window.get_width(), y: window.get_height()});
                // translate to screen coordinate
                let {x: left, y: top} = window.apply_transform_to_point(topleft);
                let {x: right, y: bottom} = window.apply_transform_to_point(rightbottom);

                // out of preview box
                if (event.x < left || event.x > right || event.y < top || event.y > bottom) continue;

                let width = right - left;
                let height = bottom - top;
                let k1 = height / width;

                let y1 = -1 * k1 * (event.x - left) + height + top;
                let y2 = k1 * (event.x - left) + top;

                let ratio  = 0.3;
                let keep = {
                    x1: left + width / 2 - width * ratio / 2,
                    y1: top + height / 2 - height * ratio / 2,
                    x2: left + width / 2 + width * ratio / 2,
                    y2: top + height / 2 + height * ratio / 2
                };

                if (event.x > keep.x1 && event.x < keep.x2
                    && event.y > keep.y1 && event.y < keep.y2) {
                    ret = {tile: this._tile, preview: window};
                } else if (event.y > y1 && event.y > y2) {
                    ret = {tile: 'TTSB', preview: window};
                } else if (event.y < y1 && event.y > y2) {
                    ret = {tile: 'SLTR', preview: window};
                } else if (event.y < y1 && event.y < y2) {
                    ret = {tile: 'STTB', preview: window};
                } else if (event.y > y1 && event.y < y2) {
                    ret = {tile: 'TLSR', preview: window};
                }
                break;
            }
        }
        return ret;
    }

    sizeChangedWindow(metaWindow) {
        if (this._tile === 'none' || !this._layoutManager.isManaged(metaWindow)) return;
        this._layoutManager.relayout();
    }
}
