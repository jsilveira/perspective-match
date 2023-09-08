# Perspective match

![alt text](./static/favicon.png)

A browser based tool (client-side javascript) to do perspective transformations on images (similar to Adobe Photoshop's "perspective warp").


## Technical notes (draft)

- Graphical way to build perspective transformations similar to CSS Matrix3D from one source image
- Similar to Photoshop's perspective warp
- The idea is to easily create transformations via control points to match:
  - A rectangular plane in perspective to its "planar" or no perspective version
  - A rectangular plane in perspective to a new perspective using destination control points
  - A rectangular plane in perspective to another image perspective of the same plane, vi indicating in the destination image where the same control points lie. 
- I have not found any straightforward way to export a CSS Matrix3D transformed image to canvas or png
