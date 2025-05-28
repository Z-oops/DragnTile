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

// qudrant_0  | quadrant_1
//------------------------
// qudrant_3  | quadrant_2
const QUAD_0 = 0;
const QUAD_1 = 1;
const QUAD_2 = 2;
const QUAD_3 = 3;
const QUAD_NONE = -1;  // a point doesn't intersect with area

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

        this._quadrant = QUAD_NONE;
        this._tile = 'none';
        this._nextTile = 'none';

        this._source = null;
        this._target = null;
        this._restoreList = {};

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

        this._tileTip?.destroy();
        this._tileTip = null;

        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            delete this._timeoutId;
        }

        this._source = null;
        this._target = null;
    }

    _onDragDrop(event) {
        if (this._tile !== 'none' && this._target instanceof WindowPreview && this._source instanceof WindowPreview) {
            this._log('DragnTileExtension.upon-app ', this._source.get_name(), ' on ', this._target.get_name());

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
            // wait for complete of the window animation
            this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._restoreList[srcMetaWin.get_id()] = srcMetaWin.connect('position-changed', () => {
                    srcMetaWin.move_resize_frame(false, savedSrcRect.x, savedSrcRect.y, savedSrcRect.width, savedSrcRect.height);
                    srcMetaWin.disconnect(this._restoreList[srcMetaWin.get_id()]);
                    delete this._restoreList[srcMetaWin.get_id()];
                });
                this._restoreList[tgtMetaWin.get_id()] = tgtMetaWin.connect('position-changed', () => {
                    tgtMetaWin.move_resize_frame(false, savedTgtRect.x, savedTgtRect.y, savedTgtRect.width, savedTgtRect.height);
                    tgtMetaWin.disconnect(this._restoreList[tgtMetaWin.get_id()]);
                    delete this._restoreList[tgtMetaWin.get_id()];
                });
                delete this._timeoutId;
                return GLib.SOURCE_REMOVE;
            });
        }

        // clear extension states when drag and drop
        this._tileTip?.hide();
        this._nextTile = 'none';
        this._tile = 'none';
        this._quadrant = QUAD_NONE;
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

        // if drag point intersects any WindowPreview
        let {quad: quadrant, preview: windowpreview} = this._getQuadrant(source._workspace, event);
        this._nextTile = this._getTileMode(quadrant, this._quadrant);
        this._quadrant = quadrant;

        if (this._nextTile !== 'none') {
            this._source = source;
            this._target = windowpreview;
        } else {
            this._tile = this._nextTile;
            this._tileTip?.hide();
            return DND.DragMotionResult.CONTINUE;
        }
        this._log('DragnTileExtension.drag', source.get_name(),
            ', point', event.x, event.y, ', quadrant', quadrant,
            ', Preview', windowpreview?.get_name(),
            ', tilemode', this._nextTile);


        if (this._nextTile !== this._tile) {
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

            if (this._nextTile === 'SLTR') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top,
                    width: (right - left) / 2,
                    height: (bottom - top)});
            } else if (this._nextTile === 'TLSR') {
                dstBound = new Mtk.Rectangle({
                    x: left + (right - left) / 2,
                    y: top,
                    width: (right - left) / 2,
                    height: (bottom - top)});
            } else if (this._nextTile === 'STTB') {
                dstBound = new Mtk.Rectangle({
                    x: left,
                    y: top,
                    width: (right - left),
                    height: (bottom - top) / 2});
            } else if (this._nextTile === 'TTSB') {
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

                    this._tile = this._nextTile;
                    break;
                }
                target = target.get_parent();
            }
        }

        // always listen dragmotion event
        return DND.DragMotionResult.CONTINUE;
    }

    _getQuadrant(workspace, event) {
        let source = event.source;
        let ret = {quad: QUAD_NONE, preview: undefined};
        // TODO: maybe peek actors at point?
        for (const window of workspace._windows) {
            if (window instanceof WindowPreview && window !== source) {
                const topleft = new Graphene.Point3D({x: 0, y: 0});
                const rightbottom = new Graphene.Point3D({x: window.get_width(), y: window.get_height()});
                // translate to screen coordinate
                let {x: left, y: top} = window.apply_transform_to_point(topleft);
                let {x: right, y: bottom} = window.apply_transform_to_point(rightbottom);

                if (event.x > left && event.x < (left + right) / 2 && event.y > top && event.y < (top + bottom) / 2) {
                    ret = {quad: QUAD_0, preview: window};
                } else if (event.x > (left + right) / 2 && event.x < right && event.y > top && event.y < (top + bottom) / 2) {
                    ret = {quad: QUAD_1, preview: window};
                } else if (event.x > (left + right) / 2 && event.x < right && event.y > (top + bottom) / 2 && event.y < bottom) {
                    ret = {quad: QUAD_2, preview: window};
                } else if (event.x > left && event.x < (left + right) / 2 && event.y > (top + bottom) / 2 && event.y < bottom) {
                    ret = {quad: QUAD_3, preview: window};
                }
                if (ret.quad !== QUAD_NONE) {
                    break;
                }
            }
        }
        return ret;
    }

    _getTileMode(current, last) {
        let ret = 'none';
        if (last === QUAD_NONE && current === QUAD_0) {
            // source left target right
            ret = 'SLTR';
        } else if (last === QUAD_NONE && current === QUAD_1) {
            ret = 'TLSR';
        } else if (last === QUAD_NONE && current === QUAD_2) {
            ret = 'TLSR';
        } else if (last === QUAD_NONE && current === QUAD_3) {
            ret = 'SLTR';
        } else if (last === QUAD_0 && current === QUAD_1) {
            ret = 'TLSR';
        } else if (last === QUAD_1 && current === QUAD_2) {
            // target top source bottom
            ret = 'TTSB';
        } else if (last === QUAD_2 && current === QUAD_3) {
            ret = 'SLTR';
        } else if (last === QUAD_3 && current === QUAD_0) {
            ret = 'STTB';
        } else if (last === QUAD_0 && current === QUAD_3) {
            ret = 'TTSB';
        } else if (last === QUAD_3 && current === QUAD_2) {
            ret = 'TLSR';
        } else if (last === QUAD_2 && current === QUAD_1) {
            ret = 'STTB';
        } else if (last === QUAD_1 && current === QUAD_0) {
            ret = 'SLTR';
        } else if (last !== current) {
            // it means from QUAD_XXX to QUAD_NONE
            ret = 'none';
        } else {
            // here we keep _nextTile, because _nextTile may not be applied now
            ret = this._nextTile;
        }
        return ret;
    }

    _log(...args) {
        if (this._debug.get_boolean()) {
            console.log(...args);
        }
    }
}
