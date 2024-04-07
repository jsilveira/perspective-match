/**
 * @param {import("$lib/types").Point} a
 * @param {import("$lib/types").Point} b
 */

export const distance = ([x, y], [x2, y2]) => Math.sqrt((x - x2) ** 2 + (y - y2) ** 2)

/**
 * 
 * @param {import("$lib/types").Bounds} bbox 
 * @returns number
 */
export const bboxWidth = (bbox) => bbox.right - bbox.left;

/**
 * 
 * @param {import("$lib/types").Bounds} bbox 
 * @returns number
 */
export const bboxHeight = (bbox) => bbox.bottom - bbox.top;

/**
 * 
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
 * 
 * @param {import("$lib/types").Bounds} bbox 
 * @returns {import("$lib/types").Point[]}
 */
export function bboxPoints({left, right, top, bottom}) {
    return [[left, top], [right, top], [right, bottom], [left, bottom]]
}