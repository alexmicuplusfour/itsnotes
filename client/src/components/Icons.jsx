import React, { memo } from 'react';

// Define SVG paths separately to avoid recreating them on each render
const iconPaths = {
  settings: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "3" },
      { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" }
    ]
  },
  database: {
    paths: [
      { elem: 'ellipse', cx: "12", cy: "5", rx: "9", ry: "3" },
      { d: "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" },
      { d: "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" }
    ]
  },
  book: {
    paths: [
      { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" },
      { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" }
    ]
  },
  video: {
    paths: [
      { d: "M23 7l-7 5 7 5V7z" },
      { d: "M14 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" }
    ]
  },
  link: {
    paths: [
      { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" },
      { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }
    ]
  },
  notes: {
    paths: [
      { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" },
      { elem: 'polyline', points: "14 2 14 8 20 8" },
      { elem: 'line', x1: "16", y1: "13", x2: "8", y2: "13" },
      { elem: 'line', x1: "16", y1: "17", x2: "8", y2: "17" },
      { elem: 'polyline', points: "10 9 9 9 8 9" }
    ]
  },
  arrow_up: {
    paths: [
      { elem: 'line', x1: "12", y1: "5", x2: "12", y2: "19" },
      { elem: 'polyline', points: "19 12 12 5 5 12" }
    ]
  },
  arrow_down: {
    paths: [
      { elem: 'line', x1: "12", y1: "5", x2: "12", y2: "19" },
      { elem: 'polyline', points: "5 12 12 19 19 12" }
    ]
  },
  arrow_up_caret: {
    paths: [
      { elem: 'polyline', points: "5 13 12 7 19 13" }
    ]
  },
  arrow_down_caret: {
    paths: [
      { elem: 'polyline', points: "5 11 12 17 19 11" }
    ]
  },
  arrow_left_caret: {
    paths: [
      { elem: 'polyline', points: "13 5 7 12 13 19" }
    ]
  },
  arrow_right_caret: {
    paths: [
      { elem: 'polyline', points: "11 5 17 12 11 19" }
    ]
  },
  clearX: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "10" },
      { elem: 'line', x1: "15", y1: "9", x2: "9", y2: "15" },
      { elem: 'line', x1: "9", y1: "9", x2: "15", y2: "15" }
    ]
  },
  image: {
    paths: [
      { elem: 'rect', x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" },
      { elem: 'circle', cx: "8.5", cy: "8.5", r: "1.5" },
      { elem: 'polyline', points: "21 15 16 10 5 21" }
    ]
  },
  summarize_ai: {
    paths: [
      { elem: 'line', x1: "3", y1: "7", x2: "11", y2: "7" },
      { elem: 'line', x1: "3", y1: "13", x2: "21", y2: "13" },
      { elem: 'line', x1: "3", y1: "18", x2: "21", y2: "18" },
      { d: "M19 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" }
    ]
  },
  ocr: {
    paths: [
      { d: "M3 7V5a2 2 0 0 1 2-2h2" },
      { d: "M17 3h2a2 2 0 0 1 2 2v2" },
      { d: "M21 17v2a2 2 0 0 1-2 2h-2" },
      { d: "M7 21H5a2 2 0 0 1-2-2v-2" },
      { d: "M8 12h8" },
      { d: "M8 16h8" },
      { d: "M8 8h8" }
    ]
  },
  clipboard: {
    paths: [
      { elem: 'rect', x: "8", y: "2", width: "8", height: "4", rx: "1", ry: "1" },
      { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }
    ]
  },
  crosshair: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "10" },
      { elem: 'line', x1: "22", y1: "12", x2: "18", y2: "12" },
      { elem: 'line', x1: "6", y1: "12", x2: "2", y2: "12" },
      { elem: 'line', x1: "12", y1: "6", x2: "12", y2: "2" },
      { elem: 'line', x1: "12", y1: "22", x2: "12", y2: "18" }
    ]
  },
  "tiptap_blockquote": {
    "paths": [
      { "elem": "line", "x1": "8", "y1": "4", "x2": "24", "y2": "4" },
      { "elem": "line", "x1": "8", "y1": "12", "x2": "24", "y2": "12" },
      { "elem": "line", "x1": "8", "y1": "20", "x2": "18", "y2": "20" },
      { "elem": "polyline", "points": "2,20 2,4" }
    ]
  },
  "tiptap_bold": {
    "paths": [
      { "elem": "path", "d": "M7,5h8 c2,0,4,2,4,4s-2,4-4,4h-8V5z" },
      { "elem": "path", "d": "M7,13h9 c2,0,4,2,4,4s-2,4-4,4h-9V13z" },
      { "elem": "path", "d": "M7,5v16" }
    ]
  },
  "tiptap_bulletlist": {
    "paths": [
      { "elem": "line", "x1": "9", "y1": "4", "x2": "24", "y2": "4" },
      { "elem": "line", "x1": "9", "y1": "12", "x2": "24", "y2": "12" },
      { "elem": "line", "x1": "9", "y1": "20", "x2": "24", "y2": "20" },
      { "elem": "line", "x1": "2", "y1": "4", "x2": "4", "y2": "4" },
      { "elem": "line", "x1": "2", "y1": "12", "x2": "4", "y2": "12" },
      { "elem": "line", "x1": "2", "y1": "20", "x2": "4", "y2": "20" }
    ]
  },
  "tiptap_h1": {
    "paths": [
      { "elem": "path", "d": "M18,6l3-2v8" },
      { "elem": "path", "d": "M3,12h10" },
      { "elem": "path", "d": "M3,20V4" },
      { "elem": "path", "d": "M13,20V4" }
    ]
  },
  "tiptap_h2": {
    "paths": [
      { "elem": "path", "d": "M22,12h-4 c0-4,4-3,4-6c0-2-2-3-4-1" },
      { "elem": "path", "d": "M3,12h10" },
      { "elem": "path", "d": "M3,20V4" },
      { "elem": "path", "d": "M13,20V4" }
    ]
  },
  "tiptap_h3": {
    "paths": [
      { "elem": "path", "d": "M19,5 c2-1,3,0,4,1c0,1-1,2-2,2" },
      { "elem": "path", "d": "M19,12 c2,1,4,0,4-2c0-1-1-2-2-2" },
      { "elem": "path", "d": "M3,12h10" },
      { "elem": "path", "d": "M3,20V4" },
      { "elem": "path", "d": "M13,20V4" }
    ]
  },
  "tiptap_italic": {
    "paths": [
      { "elem": "line", "x1": "20", "y1": "5", "x2": "11", "y2": "5" },
      { "elem": "line", "x1": "15", "y1": "21", "x2": "6", "y2": "21" },
      { "elem": "line", "x1": "16", "y1": "5", "x2": "10", "y2": "21" }
    ]
  },
  "tiptap_strikethrough": {
    "paths": [
      { "elem": "path", "d": "M16,4h-7 c-2,0-3,1-3,3c0,0,0,1,0,1" },
      { "elem": "path", "d": "M14,12 c2,0,4,2,4,4s-2,4-4,4h-8" },
      { "elem": "line", "x1": "4", "y1": "12", "x2": "20", "y2": "12" }
    ]
  },
  "tiptap_underline": {
    "paths": [
      { "elem": "path", "d": "M18,3v8 c0,3-3,6-6,6l0,0c-3,0-6-3-6-6V3" },
      { "elem": "path", "d": "M6,21h13" }
    ]
  },
  "tiptap_tasklist": {
    "paths": [
      { "elem": "circle", "cx": "6", "cy": "6", "r": "2" },
      { "elem": "circle", "cx": "6", "cy": "12", "r": "2" },
      { "elem": "circle", "cx": "6", "cy": "18", "r": "2" },
      { "elem": "line", "x1": "12", "y1": "6", "x2": "21", "y2": "6" },
      { "elem": "line", "x1": "12", "y1": "12", "x2": "21", "y2": "12" },
      { "elem": "line", "x1": "12", "y1": "18", "x2": "21", "y2": "18" }
    ]
  },
  "tiptap_highlight": {
    "paths": [
      { "elem": "path", "d": "m9 11-6 6v3h9l3-3" },
      { "elem": "path", "d": "m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" }
    ]
  },
  archive: {
    paths: [
      { elem: 'polyline', points: "21 8 21 21 3 21 3 8" },
      { elem: 'rect', x: "1", y: "3", width: "22", height: "5" },
      { elem: 'line', x1: "10", y1: "12", x2: "14", y2: "12" }
    ]
  },
  trash: {
    paths: [
      { elem: 'polyline', points: "3 6 5 6 21 6" },
      { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }
    ]
  },
  maintenance: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "10" },
      // 4-pointed sparkle (same shape as the AI 'magic' icon), offset toward
      // the top-right inside the circle with room to spare from the edge.
      { d: "M14 6.5 L14.9 9.1 L17.5 10 L14.9 10.9 L14 13.5 L13.1 10.9 L10.5 10 L13.1 9.1 Z" }
    ],
    noFill: true
  },
  pin: {
    paths: [
      { d: "M12,16.181H4.724v-0.846l2.426-3.639V3.338c0-0.668,0.544-1.212,1.213-1.212h7.276c0.68,0,1.212,0.532,1.212,1.212v8.358l2.426,3.639v0.846H12v7.072V16.181z" }
    ],
    noFill: true
  },
  pinned: {
    paths: [
      { d: "M11,23.253v-6.071H3.724v-2.148l2.426-3.639V3.338c0-1.22,0.993-2.212,2.213-2.212h7.276c1.24,0,2.213,0.972,2.213,2.212v8.056l2.426,3.639v2.148H13v6.071H11z" }
    ],
    fill: true,
    noStroke: true
  },
  menu: {
    paths: [
      { elem: 'line', x1: "3", y1: "8", x2: "21", y2: "8" },
      { elem: 'line', x1: "3", y1: "16", x2: "21", y2: "16" }
    ]
  },
  search: {
    paths: [
      { elem: 'circle', cx: "11", cy: "11", r: "8" },
      { elem: 'line', x1: "21", y1: "21", x2: "16.65", y2: "16.65" }
    ]
  },
  signOut: {
    paths: [
      { elem: 'path', d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" },
      { elem: 'polyline', points: "16 17 21 12 16 7" },
      { elem: 'line', x1: "21", y1: "12", x2: "9", y2: "12" }
    ]
  },
  copy: {
    paths: [
      { elem: 'rect', x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" },
      { elem: 'path', d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }
    ]
  },
  add: {
    paths: [
      { elem: 'line', x1: "12", y1: "5", x2: "12", y2: "19" },
      { elem: 'line', x1: "5", y1: "12", x2: "19", y2: "12" }
    ]
  },
  newNote: {
    paths: [
      // Rounded square with gap in top-right corner for pencil
      { d: "M21,11.575V19.5c0,1.334-0.666,2-2,2H5c-1.333,0-2-0.666-2-2v-15c0-1.333,0.667-2,2-2h9" },
      // Pencil line from inside square going out top-right
      { elem: 'line', x1: "10.5", y1: "14", x2: "18", y2: "6.5" },
      // Pencil tip at top
      { elem: 'line', x1: "20.55", y1: "3.95", x2: "21.55", y2: "2.95" }
    ]
  },
  addCircle: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "11" },
      { elem: 'line', x1: "12", y1: "7", x2: "12", y2: "17" },
      { elem: 'line', x1: "7", y1: "12", x2: "17", y2: "12" }
    ]
  },
  darkMode: {
    paths: [
      { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" }
    ]
  },
  lightMode: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "5" },
      { elem: 'line', x1: "12", y1: "1", x2: "12", y2: "3" },
      { elem: 'line', x1: "12", y1: "21", x2: "12", y2: "23" },
      { elem: 'line', x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" },
      { elem: 'line', x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" },
      { elem: 'line', x1: "1", y1: "12", x2: "3", y2: "12" },
      { elem: 'line', x1: "21", y1: "12", x2: "23", y2: "12" },
      { elem: 'line', x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" },
      { elem: 'line', x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" }
    ]
  },
  fullscreen: {
    paths: [
      { elem: 'polyline', points: "13 4 21 4 21 12" },
      { elem: 'polyline', points: "12 20 4 20 4 12" }
    ]
  },
  windowed: {
    paths: [
      { elem: 'polyline', points: "14 2 14 10 22 10" },
      { elem: 'polyline', points: "2 14 10 14 10 22" }
    ]
  },
  close: {
    paths: [
      { d: "M18 6L6 18" },
      { d: "M6 6l12 12" }
    ]
  },
  restore: {
    paths: [
      { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" },
      { d: "M3 3v5h5" }
    ]
  },
  unarchive: {
    paths: [
      { elem: 'polyline', points: "21 8 21 21 3 21 3 8" },
      { elem: 'rect', x: "1", y: "3", width: "22", height: "5" },
      { elem: 'line', x1: "12", y1: "12", x2: "12", y2: "18" },
      { elem: 'polyline', points: "9 14 12 11 15 14" }
    ]
  },
  deleteForever: {
    paths: [
      { elem: 'polyline', points: "3 6 5 6 21 6" },
      { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" },
      { elem: 'line', x1: "10", y1: "11", x2: "14", y2: "15" },
      { elem: 'line', x1: "14", y1: "11", x2: "10", y2: "15" }
    ]
  },
  palette: {
    paths: [
      { elem: 'circle', cx: "6.5", cy: "11.5", r: "0.5" },
      { elem: 'circle', cx: "9.5", cy: "7.5", r: "0.5" },
      { elem: 'circle', cx: "14.5", cy: "7.5", r: "0.5" },
      { elem: 'circle', cx: "17.5", cy: "11.5", r: "0.5" },
      { elem: 'path', d: "M12,22.039C6.465,22.039,1.961,17.535,1.961,12S6.465,1.961,12,1.961s10.039,4.003,10.039,8.924c0,3.075-2.503,5.577-5.577,5.577h-1.974c-0.923,0-1.675,0.75-1.675,1.673c0,0.404,0.15,0.794,0.422,1.1c0.269,0.295,0.428,0.691,0.438,1.106C13.673,21.288,12.923,22.039,12,22.039z" }
    ]
  },
  back: {
    paths: [
      { d: "M19 12H5" },
      { d: "M12 19l-7-7 7-7" }
    ]
  },
  arrow_right: {
    paths: [
      { d: "M5 12h14" },
      { d: "M12 5l7 7-7 7" }
    ]
  },
  arrow_left: {
    paths: [
      { d: "M19 12H5" },
      { d: "M12 19l-7-7 7-7" }
    ]
  },
  tag: {
    paths: [
      { d: "M21.59 14.41l-7.17 7.17a2 2 0 0 1-2.83 0L3 13V3h10l8.59 8.59a2 2 0 0 1 0 2.82z" },
      { elem: 'line', x1: "8", y1: "8", x2: "8.01", y2: "8" }
    ]
  },
  sortNewest: {
    paths: [
      { elem: 'line', x1: "12", y1: "5", x2: "12", y2: "19" },
      { elem: 'polyline', points: "19 12 12 5 5 12" }
    ]
  },
  sortOldest: {
    paths: [
      { elem: 'line', x1: "12", y1: "5", x2: "12", y2: "19" },
      { elem: 'polyline', points: "5 12 12 19 19 12" }
    ]
  },
  more: {
    paths: [
      { elem: 'circle', cx: "12", cy: "5", r: "1" },
      { elem: 'circle', cx: "12", cy: "12", r: "1" },
      { elem: 'circle', cx: "12", cy: "19", r: "1" }
    ]
  },
  noteRef: {
    paths: [
      { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" },
      { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" },
      { elem: 'line', x1: "6", y1: "12", x2: "18", y2: "12" }
    ]
  },
  refresh: {
    paths: [
      { elem: 'polyline', points: "23 4 23 10 17 10" },
      { elem: 'polyline', points: "1 20 1 14 7 14" },
      { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" }
    ]
  },
  save: {
    paths: [
      { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" },
      { elem: 'polyline', points: "17 21 17 13 7 13 7 21" },
      { elem: 'polyline', points: "7 3 7 8 15 8" }
    ]
  },
  eye: {
    paths: [
      { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" },
      { elem: 'circle', cx: "12", cy: "12", r: "3" }
    ]
  },
  "eye-slash": {
    paths: [
      { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" },
      { elem: 'line', x1: "1", y1: "1", x2: "23", y2: "23" }
    ]
  },
  edit: {
    paths: [
      { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" },
      { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" }
    ]
  },
  check: {
    paths: [
      { elem: 'polyline', points: "20 6 9 17 4 12" }
    ]
  },
  help: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "10" },
      { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" },
      { elem: 'line', x1: "12", y1: "17", x2: "12.01", y2: "17" }
    ]
  },
  viewList: {
    paths: [
      { elem: 'rect', x: "3", y: "4", width: "18", height: "6", rx: "1", ry: "1" },
      { elem: 'rect', x: "3", y: "16", width: "18", height: "6", rx: "1", ry: "1" }
    ]
  },
  viewGrid: {
    paths: [
      { elem: 'rect', x: "2", y: "2", width: "8", height: "8", rx: "1", ry: "1" },
      { elem: 'rect', x: "14", y: "2", width: "8", height: "8", rx: "1", ry: "1" },
      { elem: 'rect', x: "2", y: "14", width: "8", height: "8", rx: "1", ry: "1" },
      { elem: 'rect', x: "14", y: "14", width: "8", height: "8", rx: "1", ry: "1" }
    ]
  },
  undo: {
    paths: [
      { d: "M3 10h10c4.42 0 8 3.58 8 8v2" },
      { elem: 'polyline', points: "9 4 3 10 9 16" }
    ]
  },
  redo: {
    paths: [
      { d: "M21 10H11c-4.42 0-8 3.58-8 8v2" },
      { elem: 'polyline', points: "15 4 21 10 15 16" }
    ]
  },
  "star-outline": { // Renamed from 'star'
    paths: [
      { elem: 'polygon', points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" }
    ],
    noFill: true // Keep as outline
  },
  history: {
    paths: [
      { elem: 'circle', cx: "12", cy: "12", r: "9" },
      { elem: 'polyline', points: "12 7 12 12 16 14" }
    ]
  },
  month: {
    paths: [
      { elem: 'rect', x: "3", y: "4", width: "18", height: "16", rx: "2", ry: "2" },
      { elem: 'line', x1: "3", y1: "9", x2: "21", y2: "9" },
      { elem: 'line', x1: "7", y1: "14", x2: "17", y2: "14", 'stroke-dasharray': "2,2" }
    ]
  },
  calendar: {
    paths: [
      { elem: 'rect', x: "2", y: "4", width: "20", height: "18", rx: "2.5", ry: "2.5" },
      { elem: 'line', x1: "2", y1: "9", x2: "22", y2: "9" },
      { elem: 'circle', cx: "8", cy: "15", r: "1" }
    ]
  },

  "tabs": {
    "paths": [
      { "elem": "rect", "x": "3", "y": "4", "width": "18", "height": "16", "rx": "2", "ry": "2" },
      { "elem": "line", "x1": "16", "y1": "4", "x2": "16", "y2": "20" },
      { "elem": "line", "x1": "16", "y1": "9", "x2": "21", "y2": "9" },
      { "elem": "line", "x1": "16", "y1": "14", "x2": "21", "y2": "14" }
    ]
  },
  import: {
    paths: [
      { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" },
      { elem: 'polyline', points: "17 8 12 3 7 8" },
      { elem: 'line', x1: "12", y1: "3", x2: "12", y2: "15" }
    ]
  },
  star: { // Renamed from 'star-filled'
    paths: [
      { elem: 'polygon', points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" }
    ],
    fill: true,
    noStroke: true
  },
  "star-half": {
    paths: [
      // Outline of full star
      { elem: 'polygon', points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" },
      // Filled left half
      { d: "M12 2 L12 17.77 L5.82 21.02 L7 14.14 L2 9.27 L8.91 8.26 Z" }
    ],
    fill: true,
    halfFilled: true
  },
  magic: {
    paths: [
      { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }
    ]
  },
  robot: {
    paths: [
      { d: "M12 8V4H8" },
      { elem: "rect", x: "4", y: "8", width: "16", height: "12", rx: "2" },
      { d: "M2 14h2" },
      { d: "M20 14h2" },
      { d: "M15 13v2" },
      { d: "M9 13v2" }
    ]
  },
  spinner: {
    paths: [
      { d: "M21 12a9 9 0 1 1-6.219-8.56" }
    ]
  },
  upload: {
    paths: [
      { d: "M21 14v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" },
      { elem: 'polyline', points: "17 8 12 3 7 8" },
      { elem: 'line', x1: "12", y1: "3", x2: "12", y2: "15" }
    ]
  },
  download: {
    paths: [
      { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" },
      { elem: 'polyline', points: "7 10 12 15 17 10" },
      { elem: 'line', x1: "12", y1: "15", x2: "12", y2: "3" }
    ]
  },
  "tiptap_details": {
    "paths": [
      { "elem": "rect", "x": "3", "y": "4", "width": "18", "height": "16", "rx": "2" },
      { "elem": "polyline", "points": "8 10 12 14 16 10" }
    ]
  },
  sketch: {
    paths: [
      { d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" }
    ]
  },
  highlighter: {
    paths: [
      { d: "M22.303,6.747l-4.107-4.108c-0.453-0.453-1.188-0.453-1.643,0l-9.857,9.858L4.23,16.604l4.108,4.109l4.107-2.465l9.857-9.859C22.758,7.936,22.758,7.201,22.303,6.747z" },
      { d: "M5.406,22l-3.639-1.287l3.285-3.287l2.464,2.465L5.406,22z" },
      { elem: 'line', x1: "6.696", y1: "12.497", x2: "12.446", y2: "18.248" }
    ]
  },
  eraser: {
    paths: [
      { d: "M15.787,2.941l6.545,6.547c0.518,0.517,0.518,1.354,0,1.871l-9.354,9.353H5.497l-3.741-3.741c-0.516-0.518-0.516-1.354,0-1.871L13.914,2.941C14.432,2.425,15.271,2.425,15.787,2.941z" },
      { elem: 'line', x1: "8.19", y1: "8.664", x2: "16.607", y2: "17.084" }
    ]
  },
  attachment: {
    paths: [
      { d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" }
    ]
  },
  bell: {
    paths: [
      { d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" },
      { d: "M13.73 21a2 2 0 0 1-3.46 0" }
    ]
  },
  layoutSidebar: {
    paths: [
      { elem: 'rect', x: "3", y: "3", width: "18", height: "18", rx: "2" },
      { elem: 'line', x1: "9", y1: "3", x2: "9", y2: "21" }
    ]
  },
  rows: {
    paths: [
      { elem: 'rect', x: "3", y: "3", width: "18", height: "5", rx: "1" },
      { elem: 'rect', x: "3", y: "10", width: "18", height: "5", rx: "1" },
      { elem: 'rect', x: "3", y: "17", width: "18", height: "4", rx: "1" }
    ]
  },
  grid: {
    paths: [
      { elem: 'rect', x: "3", y: "3", width: "7", height: "7", rx: "1" },
      { elem: 'rect', x: "14", y: "3", width: "7", height: "7", rx: "1" },
      { elem: 'rect', x: "3", y: "14", width: "7", height: "7", rx: "1" },
      { elem: 'rect', x: "14", y: "14", width: "7", height: "7", rx: "1" }
    ]
  },
  share: {
    paths: [
      { elem: 'circle', cx: "18", cy: "5", r: "3" },
      { elem: 'circle', cx: "6", cy: "12", r: "3" },
      { elem: 'circle', cx: "18", cy: "19", r: "3" },
      { elem: 'line', x1: "8.59", y1: "13.51", x2: "15.42", y2: "17.49" },
      { elem: 'line', x1: "15.41", y1: "6.51", x2: "8.59", y2: "10.49" }
    ]
  },
  folder: {
    paths: [
      { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }
    ]
  },
  shield: {
    paths: [
      { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }
    ]
  },
  github: {
    paths: [
      { d: "M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" }
    ],
    fill: true,
    noStroke: true
  },
};

// Render a path element based on its type
const renderPathElement = (path, color, index, iconConfig) => {
  const key = `path-${index}`;

  if (path.elem === 'polyline') {
    return <polyline key={key} points={path.points} />;
  } else if (path.elem === 'line') {
    return <line key={key} x1={path.x1} y1={path.y1} x2={path.x2} y2={path.y2} />;
  } else if (path.elem === 'circle') {
    return <circle key={key} cx={path.cx} cy={path.cy} r={path.r} />;
  } else if (path.elem === 'ellipse') {
    return <ellipse key={key} cx={path.cx} cy={path.cy} rx={path.rx} ry={path.ry} />;
  } else if (path.elem === 'rect') {
    return <rect key={key} x={path.x} y={path.y} width={path.width} height={path.height} rx={path.rx} ry={path.ry} />;
  } else if (path.elem === 'polygon') {
    // For half-filled stars, first polygon is outline, don't fill it
    const fillPolygon = iconConfig.halfFilled ? (index > 0) : iconConfig.fill;
    return <polygon key={key} points={path.points} fill={fillPolygon ? color : 'none'} stroke={iconConfig.noStroke ? 'none' : color} />;
  } else {
    // Default case for path elements
    const fillPath = path.fill !== undefined ? path.fill : (iconConfig.halfFilled && index > 0);
    return <path key={key} d={path.d} fill={fillPath ? color : undefined} />;
  }
};

// Optimized Icon component - now wrapped with React.memo to prevent unnecessary re-renders
const Icon = memo(({ name, size = 24, color = 'currentColor', spin, className, ...props }) => {
  // Get the icon configuration
  const iconConfig = iconPaths[name];

  if (!iconConfig) {
    return null;
  }

  // Common SVG attributes
  const svgProps = {
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: iconConfig.fill ? color : (iconConfig.noFill ? "none" : "none"),
    stroke: iconConfig.noStroke ? "none" : color,
    strokeWidth: iconConfig.strokeWidth || "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: `${className || ''} ${spin ? 'spin' : ''}`.trim(),
    // Apply opacity to the whole SVG element using CSS opacity instead of SVG opacity
    // This ensures overlapping strokes don't compound (the icon is rendered fully first, then made transparent)
    style: { opacity: 0.9 },
    ...props
  };

  return (
    <svg {...svgProps}>
      {iconConfig.paths.map((path, index) =>
        renderPathElement(path, color, index, iconConfig)
      )}
    </svg>
  );
});

// Add a display name for better debugging
Icon.displayName = 'Icon';

export default Icon;
