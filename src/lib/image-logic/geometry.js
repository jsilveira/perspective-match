/**
 * @param {import("$lib/types").Point} a
 * @param {import("$lib/types").Point} b
 */

export function distance([x, y], [x2, y2]) {
    return Math.sqrt((x - x2) ** 2 + (y - y2) ** 2);
}

/**
 * 
 * @param {import("$lib/types").Bounds} bbox 
 * @returns number
 */
export function bboxWidth(bbox) {
    return bbox.right - bbox.left;
}

/**
 * 
 * @param {import("$lib/types").Bounds} bbox 
 * @returns number
 */
export function bboxHeight(bbox) {
    return bbox.bottom - bbox.top;
}

/**
 * This function scales a bounding box by a ratio defined by the ratioBounds parameter
 * @param {import("$lib/types").Bounds} bbox 
 * @param {import("$lib/types").Bounds} ratioBounds 
 * @returns {import("$lib/types").Bounds}
 */
export function bboxCrop(bbox, ratioBounds) {
    const {left, right, top, bottom} = bbox;
    const destWidth = bboxWidth(bbox);
    const destHeight = bboxHeight(bbox);
    return {
        left: left - destWidth * ratioBounds.left,
        right: right + destWidth * ratioBounds.right,
        top: top - destHeight * ratioBounds.top,
        bottom: bottom + destHeight * ratioBounds.bottom
    }
}

/**
 * This function returns the points of a bounding box
 * @param {import("$lib/types").Bounds} bbox 
 * @returns {import("$lib/types").Point[]}
 */
export function bboxPoints({left, right, top, bottom}) {
    return [[left, top], [right, top], [right, bottom], [left, bottom]]
}


/**
 * 
 * @param {import("$lib/types").Point} pointA
 * @param {import("$lib/types").Point} pointB 
 * @returns {import("$lib/types").Point}
 */
function avg([x1, y1], [x2, y2]) {
    return [(x1 + x2) / 2, (y1 + y2) / 2];
}