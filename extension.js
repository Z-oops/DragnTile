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
    }

    update(metaWindow, r, c) {
        this._windows = this._windows.filter(item => item.window !== metaWindow);
        this._windows.push({
            window: metaWindow,
            row: r, // not used currently
            col: c  // not used currently
        });
        this.relayout();
    }

    relayout() {
        // it only supports two windows now
        if (this._windows.length !== 2) return;

        let focus = this._windows.find(item => item.window.has_focus());
        if (focus === undefined) return;

        let other = this._windows.find(item => item.window !== focus.window);

        let monitor = focus.window.get_monitor();
        let workspace = focus.window.get_workspace();
        let workarea = workspace.get_work_area_for_monitor(monitor);

        let focusRect = focus.window.get_frame_rect();
        let otherRect = other.window.get_frame_rect();
        this._log('focus:', focus.window.get_title(), focusRect.x, focusRect.y, focusRect.width, focusRect.height,
            'other:', other.window.get_title(), otherRect.x, otherRect.y, otherRect.width, otherRect.height);
        if (focusRect.x < otherRect.x) {
            other.window.move_frame(true, focusRect.x + focusRect.width, otherRect.y);
            other.window.move_resize_frame(true, focusRect.x + focusRect.width, otherRect.y, workarea.x + workarea.width - focusRect.x - focusRect.width, otherRect.height);
        } else if (focusRect.x > otherRect.x) {
            other.window.move_frame(true, otherRect.x, otherRect.y);
            other.window.move_resize_frame(true, otherRect.x, otherRect.y, focusRect.x - otherRect.x, otherRect.height);
        } else if (focusRect.y < otherRect.y) {
            other.window.move_frame(true, otherRect.x, focusRect.y + focusRect.height);
            other.window.move_resize_frame(true, otherRect.x, focusRect.y + focusRect.height, otherRect.width, workarea.y + workarea.height - focusRect.y - focusRect.height);
        } else if (focusRect.y > otherRect.y) {
            other.window.move_frame(true, otherRect.x, otherRect.y);
            other.window.move_resize_frame(true, otherRect.x, otherRect.y, otherRect.width, focusRect.y - otherRect.y);
        }
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
        this._source = null;
        this._target = null;
        this._restoreList = {};

        this._shellwm =  global.window_manager;
        this._sizechangeId = null;
        this._layoutManager = new TileLayout;

        // Create a new GSettings object
        this._settings = this.getSettings();
        this._debug = this._settings.get_value('debug');

        // Watch for changes to a specific setting
        this._settings.connect('changed::debug', (settings, key) => {
            this._debug = settings.get_value(key);
            console.log('DragnTileExtension.settings', `${key} = ${settings.get_value(key).print(true)}`);
        });
    }

    disable() {
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = undefined;
        this._settings = null;
        this._shellwm =  null;
        this._layoutManager = null;

        this._tileTip?.destroy();
        this._tileTip = null;

        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            delete this._timeoutId;
        }

        this._source = null;
        this._target = null;
    }

    _log(...args) {
        if (this._debug.get_boolean()) {
            console.log(...args);
        }
    }

    _onDragDrop(event) {
        if (this._tile !== 'none' && this._target instanceof WindowPreview && this._source instanceof WindowPreview) {
            this._log('DragnTileExtension.upon-app ', this._source.get_name(), ' on ', this._target.get_name());

            this._shellwm.disconnect(this._sizechangeId);
            this._sizechangeId = null;

            let monitor = this._target.metaWindow.get_monitor();
            let workspace = this._target.metaWindow.get_workspace();
            let monitorWorkArea = workspace.get_work_area_for_monitor(monitor);

            let srcMetaWin = this._source.metaWindow;
            let tgtMetaWin = this._target.metaWindow;
            let savedSrcRect = srcMetaWin.get_frame_rect();
            if (srcMetaWin.get_maximized() || this._restoreList[srcMetaWin.get_id()] !== undefined) {
                // if the window is in maximize or split state before trigger a new split,
                // to make it simple, we just shrink saved windows size by 0.7
                savedSrcRect.width = savedSrcRect.width * 0.7;
                savedSrcRect.height = savedSrcRect.height * 0.7;
            }
            let savedTgtRect = tgtMetaWin.get_frame_rect();
            if (tgtMetaWin.get_maximized() || this._restoreList[tgtMetaWin.get_id()] !== undefined) {
                savedTgtRect.width = savedTgtRect.width * 0.7;
                savedTgtRect.height = savedTgtRect.height * 0.7;
            }

            if (this._restoreList[srcMetaWin.get_id()] !== undefined) {
                srcMetaWin.disconnect(this._restoreList[srcMetaWin.get_id()]);
                delete this._restoreList[srcMetaWin.get_id()];
            }
            if (this._restoreList[tgtMetaWin.get_id()] !== undefined) {
                tgtMetaWin.disconnect(this._restoreList[tgtMetaWin.get_id()]);
                delete this._restoreList[tgtMetaWin.get_id()];
            }

            this._target._activate();
            tgtMetaWin.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            tgtMetaWin.unmaximize(Meta.MaximizeFlags.VERTICAL);

            this._source._activate();
            srcMetaWin.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            srcMetaWin.unmaximize(Meta.MaximizeFlags.VERTICAL);

            if (this._tile === 'SLTR') {
                // source left target right
                tgtMetaWin.move_resize_frame(false, monitorWorkArea.x + monitorWorkArea.width/2, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);
                srcMetaWin.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);
            } else if (this._tile === 'TLSR') {
                tgtMetaWin.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);
                srcMetaWin.move_resize_frame(false, monitorWorkArea.x + monitorWorkArea.width/2, monitorWorkArea.y, monitorWorkArea.width/2, monitorWorkArea.height);
            } else if (this._tile === 'STTB') {
                // source top target bottom
                tgtMetaWin.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y + monitorWorkArea.height/2, monitorWorkArea.width, monitorWorkArea.height/2);
                srcMetaWin.move_resize_frame(false, 0, 0, monitorWorkArea.width, monitorWorkArea.height/2);
            } else if (this._tile === 'TTSB') {
                tgtMetaWin.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y, monitorWorkArea.width, monitorWorkArea.height/2);
                srcMetaWin.move_resize_frame(false, monitorWorkArea.x, monitorWorkArea.y + monitorWorkArea.height/2, monitorWorkArea.width, monitorWorkArea.height/2);
            }

            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                delete this._timeoutId;
            }

            let restoreWindow = (metaWin) => {
                let monitor = metaWin.get_monitor();
                let workspace = metaWin.get_workspace();
                let workarea = workspace.get_work_area_for_monitor(monitor);
                const wf = metaWin.get_frame_rect();

                if (wf.x === workarea.x || wf.y === workarea.y) return;

                srcMetaWin.move_resize_frame(false, savedSrcRect.x, savedSrcRect.y, savedSrcRect.width, savedSrcRect.height);
                srcMetaWin.disconnect(this._restoreList[srcMetaWin.get_id()]);
                delete this._restoreList[srcMetaWin.get_id()];

                tgtMetaWin.move_resize_frame(false, savedTgtRect.x, savedTgtRect.y, savedTgtRect.width, savedTgtRect.height);
                tgtMetaWin.disconnect(this._restoreList[tgtMetaWin.get_id()]);
                delete this._restoreList[tgtMetaWin.get_id()];

                this._shellwm.disconnect(this._sizechangeId);
                this._sizechangeId = null;

                this._tile = 'none';
            }

            // wait for complete of the window animation
            this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                // quit splt state when window position changes
                this._restoreList[srcMetaWin.get_id()] = srcMetaWin.connect('position-changed', restoreWindow.bind(this));
                this._restoreList[tgtMetaWin.get_id()] = tgtMetaWin.connect('position-changed', restoreWindow.bind(this));
                this._sizechangeId = this._shellwm.connect('size-changed', this._sizeChangedWindow.bind(this));

                this._layoutManager.update(tgtMetaWin, 1, 1);
                this._layoutManager.update(srcMetaWin, 1, 1);

                delete this._timeoutId;
                return GLib.SOURCE_REMOVE;
            });
        }

        // clear extension states when drag and drop
        this._tileTip?.hide();
        //this._tile = 'none';
        // release window resource
        this._source = null;
        this._target = null;
        return DND.DragDropResult.CONTINUE;
    }

    _onDragMotion(event) {
        let source = event.source;
        if (!(source instanceof WindowPreview)) {
            return DND.DragMotionResult.CONTINUE;
        }
        this._source = source;

        // if drag point intersects any WindowPreview
        let { tile: tile, preview: windowpreview } = this._getWindowTile(source._workspace, event);
        let tileChanged = !(this._tile === tile);
        this._tile = tile;
        this._target = windowpreview;
        if (this._tile === 'none') {
            this._tileTip?.hide();
            return DND.DragMotionResult.CONTINUE;
        }

        this._log('DragnTileExtension.drag', source.get_name(),
            ', point', event.x, event.y,
            ', Preview', windowpreview?.get_name(),
            ', tilemode', this._tile);


        if (tileChanged) {
            // Here tileTip is on top of target preview. Hide it first to
            // let drag event pass in a target preview window.
            this._tileTip?.hide();

            let target = this._target;
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
            this._log('DragnTileExtension.drag: dst', dstBound?.x, dstBound?.y, dstBound?.width, dstBound?.height);

            while (target && dstBound !== undefined) {
                if (target instanceof WindowPreview) {
                    if (this._tileTip) {
                        this._tileTip.hide();
                    }

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
                    this._log('DragnTileExtension.drag tiletip bounds', dstBound.x, dstBound.y, dstBound.width, dstBound.height);
                    break;
                }
                target = target.get_parent();
            }
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
                if (ret.tile !== 'none') {
                    break;
                }
            }
        }
        return ret;
    }

    _sizeChangedWindow(shellwm, actor) {
        if (!(actor instanceof Meta.WindowActor) || this._tile === 'none') return;
        this._layoutManager.update(actor.get_meta_window(), 1, 1);
    }
}
