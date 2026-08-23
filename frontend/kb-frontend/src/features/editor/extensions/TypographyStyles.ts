import { Extension, getStyleProperty } from '@tiptap/core'
import { FontSize, LineHeight } from '@tiptap/extension-text-style'

import {
  sanitizeCssFontSize,
  sanitizeCssFontStyle,
  sanitizeCssFontWeight,
  sanitizeCssLineHeight
} from '../lib/typographyStyles'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    typographyStyles: {
      setFontWeight: (fontWeight: string) => ReturnType
      unsetFontWeight: () => ReturnType
      setFontStyle: (fontStyle: string) => ReturnType
      unsetFontStyle: () => ReturnType
    }
  }
}

declare module '@tiptap/extension-text-style' {
  interface TextStyleAttributes {
    fontWeight?: string | null
    fontStyle?: string | null
  }
}

/**
 * Tiptap's stock extensions intentionally accept any string. These wrappers
 * preserve arbitrary valid CSS values while preventing untrusted JSON/HTML
 * from becoming an unrestricted inline-style passthrough during rendering.
 */
export const SafeFontSize = FontSize.extend({
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => sanitizeCssFontSize(
            getStyleProperty(element, 'font-size') ?? element.style.fontSize
          ),
          renderHTML: attributes => {
            const fontSize = sanitizeCssFontSize(String(attributes.fontSize ?? ''))
            return fontSize ? { style: `font-size: ${fontSize}` } : {}
          }
        }
      }
    }]
  },

  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        const safeFontSize = sanitizeCssFontSize(fontSize)
        return safeFontSize
          ? chain().setMark('textStyle', { fontSize: safeFontSize }).run()
          : false
      },
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }
  }
})

export const SafeLineHeight = LineHeight.extend({
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: element => sanitizeCssLineHeight(
            getStyleProperty(element, 'line-height') ?? element.style.lineHeight
          ),
          renderHTML: attributes => {
            const lineHeight = sanitizeCssLineHeight(String(attributes.lineHeight ?? ''))
            return lineHeight ? { style: `line-height: ${lineHeight}` } : {}
          }
        }
      }
    }]
  },

  addCommands() {
    return {
      setLineHeight: lineHeight => ({ chain }) => {
        const safeLineHeight = sanitizeCssLineHeight(lineHeight)
        return safeLineHeight
          ? chain().setMark('textStyle', { lineHeight: safeLineHeight }).run()
          : false
      },
      unsetLineHeight: () => ({ chain }) =>
        chain().setMark('textStyle', { lineHeight: null }).removeEmptyTextStyle().run()
    }
  }
})

export const TypographyStyles = Extension.create({
  name: 'typographyStyles',

  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontWeight: {
          default: null,
          parseHTML: element => sanitizeCssFontWeight(
            getStyleProperty(element, 'font-weight') ?? element.style.fontWeight
          ),
          renderHTML: attributes => {
            const fontWeight = sanitizeCssFontWeight(String(attributes.fontWeight ?? ''))
            return fontWeight ? { style: `font-weight: ${fontWeight}` } : {}
          }
        },
        fontStyle: {
          default: null,
          parseHTML: element => sanitizeCssFontStyle(
            getStyleProperty(element, 'font-style') ?? element.style.fontStyle
          ),
          renderHTML: attributes => {
            const fontStyle = sanitizeCssFontStyle(String(attributes.fontStyle ?? ''))
            return fontStyle ? { style: `font-style: ${fontStyle}` } : {}
          }
        }
      }
    }]
  },

  addCommands() {
    return {
      setFontWeight: fontWeight => ({ chain }) => {
        const safeFontWeight = sanitizeCssFontWeight(fontWeight)
        return safeFontWeight
          ? chain().setMark('textStyle', { fontWeight: safeFontWeight }).run()
          : false
      },
      unsetFontWeight: () => ({ chain }) =>
        chain().setMark('textStyle', { fontWeight: null }).removeEmptyTextStyle().run(),
      setFontStyle: fontStyle => ({ chain }) => {
        const safeFontStyle = sanitizeCssFontStyle(fontStyle)
        return safeFontStyle
          ? chain().setMark('textStyle', { fontStyle: safeFontStyle }).run()
          : false
      },
      unsetFontStyle: () => ({ chain }) =>
        chain().setMark('textStyle', { fontStyle: null }).removeEmptyTextStyle().run()
    }
  }
})
