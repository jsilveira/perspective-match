/**
 * @typedef {[number, number]} Point
 * @typedef {{left: number, top: number, bottom: number, right: number}} Bounds
 */

/**
 * @param {Point} a
 * @param {Point} b
 */
export const distance = ([x, y], [x2, y2]) => Math.sqrt((x - x2) ** 2 + (y - y2) ** 2)
