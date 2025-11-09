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
import Meta from 'gi://Meta';
import St from 'gi://St';
import Graphene from 'gi://Graphene';
import Mtk from 'gi://Mtk';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const WINDOW_ANIMATION_TIME = 250;

class TileLayout {
    constructor() {
        this._windows = [];
        this._gap = 2;
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

        let workarea = Utils.getMonitorWorkarea(focus);
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

    clear() {
        this._windows = [];
        this._tile = "none";
        this._nextTile = "none"
        this._savedWindowRects.clear();
    }

    setGap(gap) {
        this._gap = gap;
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

    static getMonitorWorkarea(metaWindow) {
        const monitor = metaWindow.get_monitor();
        const workspace = metaWindow.get_workspace();
        return workspace.get_work_area_for_monitor(monitor);
    }

    static getMetaWindow(id) {
        return global.get_window_actors().find(actor => id === actor.get_meta_window().get_id())?.get_meta_window();
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

        this._layoutManager.setGap(this._gap);
    }

    disable() {
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = undefined;
        this._settings = null;
        this._layoutManager = null;

        this._tileTip.destroy();
        this._tileTip = null;
        this.tryDisconnect(this.timeoutId);
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

        this._layoutManager.clear();
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
        const workarea = Utils.getMonitorWorkarea(triggerWindow);
        const wf = triggerWindow.get_frame_rect();
        // it doesn't quit tiling
        if (wf.x === workarea.x || wf.y === workarea.y) return;

        this._positionChangeIds.forEach((value, key, map) => {
            Utils.getMetaWindow(key)?.disconnect(value);
        });
        this._positionChangeIds.clear();

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
