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
import GObject from 'gi://GObject';
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

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const WINDOW_ANIMATION_TIME = 250;
const PREVIEW_IMG = GLib.build_filenamev([GLib.get_user_cache_dir(), `DragnTile.snapshot.png`]);
let ICON_IMG = "";  // initialized in DragnTileExtension.enable

class TilingPreview {
    constructor(metaWindows, imagePath) {
        const idx = global.workspace_manager.get_active_workspace_index();
        const workspace = Main.overview._overview._controls._workspacesDisplay._workspacesViews[0]._workspaces[idx];
        this.preview = new WindowPreview(metaWindows[0], workspace, workspace._overviewAdjustment);
        this.metaWindows = metaWindows;

        const pixbuf = GdkPixbuf.Pixbuf.new_from_file(imagePath);
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

        const workArea = Utils.getMonitorWorkarea();
        this.replaceActor = new Clutter.Actor({
            content: imageContent,
            reactive: true,              // to receive click event
            width: workArea.width,
            height: workArea.height,
            x_expand: true,
            y_expand: true,
        });

        this.previewShowId = this.preview.connect('show', () => {
            this.preview.add_child(this.replaceActor);
            this.preview.set_child_below_sibling(this.replaceActor, this.preview._title);
            this.replaceActor.show();
        });

        // custom icon
        // porting from WindowPrevew
        this.preview.remove_child(this.preview._icon);
        const icon = new St.Icon({
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(ICON_IMG)}),
            icon_size: 64
        });
        icon.add_style_class_name('window-icon');
        icon.add_style_class_name('icon-dropshadow');
        icon.set({
            reactive: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        const windowContainer = this.preview.get_child_at_index(0);
        icon.add_constraint(new Clutter.BindConstraint({
            source: windowContainer,
            coordinate: Clutter.BindCoordinate.POSITION,
        }));
        icon.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.X_AXIS,
            factor: 0.5,
        }));
        icon.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.Y_AXIS,
            pivot_point: new Graphene.Point({x: -1, y: 0.7}),
            factor: 1,
        }));
        this.preview._icon = icon;
        this.preview.add_child(this.preview._icon);
        this.preview.set_child_below_sibling(this.preview._icon, this.preview._closeButton);

        // custom title
        this.preview._title.text = "Tiling preview";

        // interactive
        // handle focus in/out
        this.previewShowChromeId = this.preview._title.connect('show', () => {
            // porting from WindowPreview.js:showOverlay()
            // do the same animation with replaceActor's parent
            const WINDOW_SCALE_TIME = 200;
            const WINDOW_ACTIVE_SIZE_INC = 5; // in each direction
            const [width, height] = this.preview.window_container.get_size();
            const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
            const activeExtraSize = WINDOW_ACTIVE_SIZE_INC * 2 * scaleFactor;
            const origSize = Math.max(width, height);
            const scale = (origSize + activeExtraSize) / origSize;

            Utils.log('preview', this.preview.window_container.get_x(), this.preview.window_container.get_y(), width, height,
                'replace', this.replaceActor.get_x(), this.replaceActor.get_y(), this.replaceActor.get_size());
            this.replaceActor.set_pivot_point(0.5, 0.5);
            this.replaceActor.ease({
                scale_x: scale,
                scale_y: scale,
                duration: WINDOW_SCALE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
        this.previewHideChromeId = this.preview._title.connect('hide', () => {
            // porting from WindowPreview.js:hideOverlay()
            const WINDOW_SCALE_TIME = 200;
            this.replaceActor.ease({
                scale_x: 1,
                scale_y: 1,
                duration: WINDOW_SCALE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });

        // handle click
        const clickGesture = new Clutter.ClickGesture();
        clickGesture.connect('recognize', () => {
            // TODO: move to specified workspace
            this.metaWindows.forEach(window => Main.activateWindow(window, null, 0 /* ws number */));
        });
        this.replaceActor.add_action(clickGesture);

        // modify the function of the close button
        this.preview._deleteAll = function() {
            // quit tiling
        }

        // diable dnd of a TilingPreview
        this.preview._draggable._gestureRecognized = function() { /* do nothing */ }
    }

    show () {
        const idx = global.workspace_manager.get_active_workspace_index();
        const workspace = Main.overview._overview._controls._workspacesDisplay._workspacesViews[0]._workspaces[idx];
        const layoutManager = workspace._container.layout_manager;

        // hook the size which used by layoutmanager, so that the preview shows
        // in the overview according to workarea size instead of metawindow size
        const workArea = Utils.getMonitorWorkarea();
        Object.defineProperty(this.preview, 'boundingBox', {
            get: function() {
                return {
                    x: workArea.x,
                    y: workArea.y,
                    width: workArea.width,
                    height: workArea.height
                };
            },
            configurable: true, // must be true for restoring
            enumerable: true
        });
        layoutManager.addWindow(this.preview, this.metaWindows[0]);
    }

    clear() {
        Utils.tryDisconnect(this.previewShowId);
        Utils.tryDisconnect(this.previewShowChromeId);
        Utils.tryDisconnect(this.previewHideChromeId);
        this.replaceActor.destroy();
        this.replaceActor = null;
        this.preview._icon.destroy();
        this.preview._icon = null;
        this.preview.destroy();
        this.preview = null;
    }
}

const TilingLayout = GObject.registerClass({
    GTypeName: 'TilingLayout',
    Signals: {
        'dragntile-relayout': {}
    },
}, class TilingLayout extends GObject.Object {
    constructor() {
        super();
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

        this.emit('dragntile-relayout');

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
});

class Utils {
    static log(...args) {
        if (DragnTileExtension._debug) {
            console.log(...args);
        }
    }

    static unmaximize(metaWindow) {
        if (metaWindow.set_unmaximize_flags === undefined) {
            // <= gnome48, it's for compatibility with diffrent gnome versions.
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

    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static async captureWorkArea() {
        // wait for the window animation to complete and get the correct workarea size
        await Utils.sleep(1000);
        // TODO: it's better to wait for animation done other than sleep a fixed time

        if (this.inCapture)
            return Promise.reject("Already in capturing");
        this.inCapture = true;

        try {
            const workArea = Utils.getMonitorWorkarea();

            //const savePath = GLib.build_filenamev([GLib.get_user_cache_dir(), `DragnTile.snapshot.png`]);
            const file = Gio.File.new_for_path(PREVIEW_IMG);
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
                            this.inCapture = false;
                            resolve(PREVIEW_IMG);
                        } catch (e) {
                            this.inCapture = false;
                            reject(e);
                        }
                    }
                );

                // TODO: find a way to only capture tiled windows
                // screenshot.screenshot_window(
                //     true,
                //     false,
                //     outputStream,
                //     (obj, res) => {
                //         try {
                //             outputStream.close(null);
                //             resolve(savePath);
                //         } catch (e) {
                //             reject(e);
                //         }
                //     }
                // );
            });
        } catch (err) {
            return Promise.reject("captureWorkArea failed");
        }
    }

    static tryDisconnect(id) {
        if (id) GLib.Source.remove(id);
    }

}

export default class DragnTileExtension extends Extension {
    enable() {
        ICON_IMG = this.dir.get_child('assets/icon.png').get_path();

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
        this._layoutManager = new TilingLayout();

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

        this.useTilingPreview = this._settings.get_value('tiling-preview').get_boolean();
        this._settings.connect('changed::tiling-preview', (settings, key) => {
            this.useTilingPreview = settings.get_value(key).get_boolean();
            console.log('DragnTileExtension.settings', `${key} = ${settings.get_value(key).print(true)}`);
        });

        this._layoutManager.setGap(this._gap);
        this._layoutManager.setAround(this.around);
        this.relayoutId = this._layoutManager.connect('dragntile-relayout', () => {
            Utils.captureWorkArea().catch(err => Utils.log('captureWorkArea failed.'));
        });

        const stateAdjustment = Main.overview._overview._controls._stateAdjustment;
        this.overviewStateAdjId = stateAdjustment.connect('notify::value', (adj) => {
            if (!this.useTilingPreview) return;

            // hidden to window_pick 0...1.0
            // hidden to app_grid 1.0...2.0
            // app_grid to hidden 1.0...0
            // app_grid to window_picker 2.0...1.0
            const shouldAllocPreview = adj.value > ControlsState.HIDDEN
                                        && adj.value < ControlsState.WINDOW_PICKER
                                        && (this.previousAdjValue === ControlsState.HIDDEN
                                            || this.previousAdjValue === ControlsState.APP_GRID);
            const shouldDestroyPreview = adj.value === ControlsState.HIDDEN;
            if (shouldAllocPreview) {
                if (this._tile !== 'none'
                    && Utils.getMetaWindow(this._targetId).get_workspace() === global.workspace_manager.get_active_workspace()) {
                    // TODO: check if there is a leak
                    if (this.tilingPreview === undefined) {
                        this.tilingPreview = new TilingPreview(
                                [Utils.getMetaWindow(this._targetId), Utils.getMetaWindow(this._dropId)],
                                PREVIEW_IMG);

                    }
                    this.tilingPreview.show();
                }
            } else if (shouldDestroyPreview) {
                this.tilingPreview?.clear();
                this.tilingPreview = undefined;
            } else {
            }
            this.previousAdjValue = adj.value;
        });

        this.workspaceChangeId = global.workspace_manager.connect('active-workspace-changed', () => {
            if (!this.useTilingPreview) return;

            const stateAdjustment = Main.overview._overview._controls._stateAdjustment;
            if (stateAdjustment.value === ControlsState.WINDOW_PICKER) {
                if (this._tile !== 'none' && (Utils.getMetaWindow(this._targetId).get_workspace()
                                                === global.workspace_manager.get_active_workspace())) {
                    // TODO: check if there is a leak
                    if (this.tilingPreview === undefined) {
                        this.tilingPreview = new TilingPreview(
                                [Utils.getMetaWindow(this._targetId), Utils.getMetaWindow(this._dropId)],
                                PREVIEW_IMG);
                    }
                    this.tilingPreview.show();
                }
            }
        });
    }

    disable() {
        DND.removeDragMonitor(this._dragMonitor);
        this.unregisterWindowEvent();
        this._dragMonitor = undefined;
        this._settings = null;
        this._layoutManager = null;

        this._tileTip.destroy();
        this._tileTip = null;
        this.tilingPreview?.clear();
        this.tilingPreview = null;
        Utils.tryDisconnect(this.timeoutId);
        Utils.tryDisconnect(this.overviewStateAdjId);
        Utils.tryDisconnect(this.workspaceChangeId);
        Utils.tryDisconnect(this.relayoutId);
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
        Utils.tryDisconnect(this.timeoutId);
        this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this.registerWindowEvent();
            this.timeoutId = undefined;
            return GLib.SOURCE_REMOVE;
        });
        return DND.DragDropResult.CONTINUE;
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

    unregisterWindowEvent() {
        this._positionChangeIds.forEach((value, key, map) => {
            Utils.getMetaWindow(key)?.disconnect(value);
        });
        this._positionChangeIds.clear(true);

        this._sizechangeId.forEach((value, key, map) => {
            Utils.getMetaWindow(key)?.disconnect(value);
        });
        this._sizechangeId.clear();
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
        // we only need to be notified once
        Main.overview.disconnect(this._hiddenId);
    }

    checkQuitTile(triggerWindow) {
        const workarea = this._layoutManager.getTileWorkarea();
        const wf = triggerWindow.get_frame_rect();
        // it doesn't quit tiling
        if (wf.x === workarea.x || wf.y === workarea.y) return;
        this.unregisterWindowEvent();
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
