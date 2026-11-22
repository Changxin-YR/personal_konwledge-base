var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target3) => (target3 = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target3, "default", { value: mod, enumerable: true }) : target3,
  mod
));

// node_modules/.pnpm/xmlchars@2.2.0/node_modules/xmlchars/xml/1.0/ed5.js
var require_ed5 = __commonJS({
  "node_modules/.pnpm/xmlchars@2.2.0/node_modules/xmlchars/xml/1.0/ed5.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CHAR = "	\n\r -\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}";
    exports.S = " 	\r\n";
    exports.NAME_START_CHAR = ":A-Z_a-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
    exports.NAME_CHAR = "-" + exports.NAME_START_CHAR + ".0-9\xB7\u0300-\u036F\u203F-\u2040";
    exports.CHAR_RE = new RegExp("^[" + exports.CHAR + "]$", "u");
    exports.S_RE = new RegExp("^[" + exports.S + "]+$", "u");
    exports.NAME_START_CHAR_RE = new RegExp("^[" + exports.NAME_START_CHAR + "]$", "u");
    exports.NAME_CHAR_RE = new RegExp("^[" + exports.NAME_CHAR + "]$", "u");
    exports.NAME_RE = new RegExp("^[" + exports.NAME_START_CHAR + "][" + exports.NAME_CHAR + "]*$", "u");
    exports.NMTOKEN_RE = new RegExp("^[" + exports.NAME_CHAR + "]+$", "u");
    var TAB = 9;
    var NL = 10;
    var CR = 13;
    var SPACE = 32;
    exports.S_LIST = [SPACE, NL, CR, TAB];
    function isChar(c) {
      return c >= SPACE && c <= 55295 || c === NL || c === CR || c === TAB || c >= 57344 && c <= 65533 || c >= 65536 && c <= 1114111;
    }
    exports.isChar = isChar;
    function isS(c) {
      return c === SPACE || c === NL || c === CR || c === TAB;
    }
    exports.isS = isS;
    function isNameStartChar(c) {
      return c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 58 || c === 95 || c === 8204 || c === 8205 || c >= 192 && c <= 214 || c >= 216 && c <= 246 || c >= 248 && c <= 767 || c >= 880 && c <= 893 || c >= 895 && c <= 8191 || c >= 8304 && c <= 8591 || c >= 11264 && c <= 12271 || c >= 12289 && c <= 55295 || c >= 63744 && c <= 64975 || c >= 65008 && c <= 65533 || c >= 65536 && c <= 983039;
    }
    exports.isNameStartChar = isNameStartChar;
    function isNameChar(c) {
      return isNameStartChar(c) || c >= 48 && c <= 57 || c === 45 || c === 46 || c === 183 || c >= 768 && c <= 879 || c >= 8255 && c <= 8256;
    }
    exports.isNameChar = isNameChar;
  }
});

// node_modules/.pnpm/xmlchars@2.2.0/node_modules/xmlchars/xml/1.1/ed2.js
var require_ed2 = __commonJS({
  "node_modules/.pnpm/xmlchars@2.2.0/node_modules/xmlchars/xml/1.1/ed2.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CHAR = "-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}";
    exports.RESTRICTED_CHAR = "-\b\v\f-\x7F-\x84\x86-\x9F";
    exports.S = " 	\r\n";
    exports.NAME_START_CHAR = ":A-Z_a-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
    exports.NAME_CHAR = "-" + exports.NAME_START_CHAR + ".0-9\xB7\u0300-\u036F\u203F-\u2040";
    exports.CHAR_RE = new RegExp("^[" + exports.CHAR + "]$", "u");
    exports.RESTRICTED_CHAR_RE = new RegExp("^[" + exports.RESTRICTED_CHAR + "]$", "u");
    exports.S_RE = new RegExp("^[" + exports.S + "]+$", "u");
    exports.NAME_START_CHAR_RE = new RegExp("^[" + exports.NAME_START_CHAR + "]$", "u");
    exports.NAME_CHAR_RE = new RegExp("^[" + exports.NAME_CHAR + "]$", "u");
    exports.NAME_RE = new RegExp("^[" + exports.NAME_START_CHAR + "][" + exports.NAME_CHAR + "]*$", "u");
    exports.NMTOKEN_RE = new RegExp("^[" + exports.NAME_CHAR + "]+$", "u");
    var TAB = 9;
    var NL = 10;
    var CR = 13;
    var SPACE = 32;
    exports.S_LIST = [SPACE, NL, CR, TAB];
    function isChar(c) {
      return c >= 1 && c <= 55295 || c >= 57344 && c <= 65533 || c >= 65536 && c <= 1114111;
    }
    exports.isChar = isChar;
    function isRestrictedChar(c) {
      return c >= 1 && c <= 8 || c === 11 || c === 12 || c >= 14 && c <= 31 || c >= 127 && c <= 132 || c >= 134 && c <= 159;
    }
    exports.isRestrictedChar = isRestrictedChar;
    function isCharAndNotRestricted(c) {
      return c === 9 || c === 10 || c === 13 || c > 31 && c < 127 || c === 133 || c > 159 && c <= 55295 || c >= 57344 && c <= 65533 || c >= 65536 && c <= 1114111;
    }
    exports.isCharAndNotRestricted = isCharAndNotRestricted;
    function isS(c) {
      return c === SPACE || c === NL || c === CR || c === TAB;
    }
    exports.isS = isS;
    function isNameStartChar(c) {
      return c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 58 || c === 95 || c === 8204 || c === 8205 || c >= 192 && c <= 214 || c >= 216 && c <= 246 || c >= 248 && c <= 767 || c >= 880 && c <= 893 || c >= 895 && c <= 8191 || c >= 8304 && c <= 8591 || c >= 11264 && c <= 12271 || c >= 12289 && c <= 55295 || c >= 63744 && c <= 64975 || c >= 65008 && c <= 65533 || c >= 65536 && c <= 983039;
    }
    exports.isNameStartChar = isNameStartChar;
    function isNameChar(c) {
      return isNameStartChar(c) || c >= 48 && c <= 57 || c === 45 || c === 46 || c === 183 || c >= 768 && c <= 879 || c >= 8255 && c <= 8256;
    }
    exports.isNameChar = isNameChar;
  }
});

// node_modules/.pnpm/xmlchars@2.2.0/node_modules/xmlchars/xmlns/1.0/ed3.js
var require_ed3 = __commonJS({
  "node_modules/.pnpm/xmlchars@2.2.0/node_modules/xmlchars/xmlns/1.0/ed3.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NC_NAME_START_CHAR = "A-Z_a-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
    exports.NC_NAME_CHAR = "-" + exports.NC_NAME_START_CHAR + ".0-9\xB7\u0300-\u036F\u203F-\u2040";
    exports.NC_NAME_START_CHAR_RE = new RegExp("^[" + exports.NC_NAME_START_CHAR + "]$", "u");
    exports.NC_NAME_CHAR_RE = new RegExp("^[" + exports.NC_NAME_CHAR + "]$", "u");
    exports.NC_NAME_RE = new RegExp("^[" + exports.NC_NAME_START_CHAR + "][" + exports.NC_NAME_CHAR + "]*$", "u");
    function isNCNameStartChar(c) {
      return c >= 65 && c <= 90 || c === 95 || c >= 97 && c <= 122 || c >= 192 && c <= 214 || c >= 216 && c <= 246 || c >= 248 && c <= 767 || c >= 880 && c <= 893 || c >= 895 && c <= 8191 || c >= 8204 && c <= 8205 || c >= 8304 && c <= 8591 || c >= 11264 && c <= 12271 || c >= 12289 && c <= 55295 || c >= 63744 && c <= 64975 || c >= 65008 && c <= 65533 || c >= 65536 && c <= 983039;
    }
    exports.isNCNameStartChar = isNCNameStartChar;
    function isNCNameChar(c) {
      return isNCNameStartChar(c) || (c === 45 || c === 46 || c >= 48 && c <= 57 || c === 183 || c >= 768 && c <= 879 || c >= 8255 && c <= 8256);
    }
    exports.isNCNameChar = isNCNameChar;
  }
});

// node_modules/.pnpm/saxes@6.0.0/node_modules/saxes/saxes.js
var require_saxes = __commonJS({
  "node_modules/.pnpm/saxes@6.0.0/node_modules/saxes/saxes.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SaxesParser = exports.EVENTS = void 0;
    var ed5 = require_ed5();
    var ed2 = require_ed2();
    var NSed3 = require_ed3();
    var isS = ed5.isS;
    var isChar10 = ed5.isChar;
    var isNameStartChar = ed5.isNameStartChar;
    var isNameChar = ed5.isNameChar;
    var S_LIST = ed5.S_LIST;
    var NAME_RE = ed5.NAME_RE;
    var isChar11 = ed2.isChar;
    var isNCNameStartChar = NSed3.isNCNameStartChar;
    var isNCNameChar = NSed3.isNCNameChar;
    var NC_NAME_RE = NSed3.NC_NAME_RE;
    var XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
    var XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
    var rootNS = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      __proto__: null,
      xml: XML_NAMESPACE,
      xmlns: XMLNS_NAMESPACE
    };
    var XML_ENTITIES = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      __proto__: null,
      amp: "&",
      gt: ">",
      lt: "<",
      quot: '"',
      apos: "'"
    };
    var EOC = -1;
    var NL_LIKE = -2;
    var S_BEGIN = 0;
    var S_BEGIN_WHITESPACE = 1;
    var S_DOCTYPE = 2;
    var S_DOCTYPE_QUOTE = 3;
    var S_DTD = 4;
    var S_DTD_QUOTED = 5;
    var S_DTD_OPEN_WAKA = 6;
    var S_DTD_OPEN_WAKA_BANG = 7;
    var S_DTD_COMMENT = 8;
    var S_DTD_COMMENT_ENDING = 9;
    var S_DTD_COMMENT_ENDED = 10;
    var S_DTD_PI = 11;
    var S_DTD_PI_ENDING = 12;
    var S_TEXT = 13;
    var S_ENTITY = 14;
    var S_OPEN_WAKA = 15;
    var S_OPEN_WAKA_BANG = 16;
    var S_COMMENT = 17;
    var S_COMMENT_ENDING = 18;
    var S_COMMENT_ENDED = 19;
    var S_CDATA = 20;
    var S_CDATA_ENDING = 21;
    var S_CDATA_ENDING_2 = 22;
    var S_PI_FIRST_CHAR = 23;
    var S_PI_REST = 24;
    var S_PI_BODY = 25;
    var S_PI_ENDING = 26;
    var S_XML_DECL_NAME_START = 27;
    var S_XML_DECL_NAME = 28;
    var S_XML_DECL_EQ = 29;
    var S_XML_DECL_VALUE_START = 30;
    var S_XML_DECL_VALUE = 31;
    var S_XML_DECL_SEPARATOR = 32;
    var S_XML_DECL_ENDING = 33;
    var S_OPEN_TAG = 34;
    var S_OPEN_TAG_SLASH = 35;
    var S_ATTRIB = 36;
    var S_ATTRIB_NAME = 37;
    var S_ATTRIB_NAME_SAW_WHITE = 38;
    var S_ATTRIB_VALUE = 39;
    var S_ATTRIB_VALUE_QUOTED = 40;
    var S_ATTRIB_VALUE_CLOSED = 41;
    var S_ATTRIB_VALUE_UNQUOTED = 42;
    var S_CLOSE_TAG = 43;
    var S_CLOSE_TAG_SAW_WHITE = 44;
    var TAB = 9;
    var NL = 10;
    var CR = 13;
    var SPACE = 32;
    var BANG = 33;
    var DQUOTE = 34;
    var AMP = 38;
    var SQUOTE = 39;
    var MINUS = 45;
    var FORWARD_SLASH = 47;
    var SEMICOLON = 59;
    var LESS = 60;
    var EQUAL = 61;
    var GREATER = 62;
    var QUESTION = 63;
    var OPEN_BRACKET = 91;
    var CLOSE_BRACKET = 93;
    var NEL = 133;
    var LS = 8232;
    var isQuote = (c) => c === DQUOTE || c === SQUOTE;
    var QUOTES = [DQUOTE, SQUOTE];
    var DOCTYPE_TERMINATOR = [...QUOTES, OPEN_BRACKET, GREATER];
    var DTD_TERMINATOR = [...QUOTES, LESS, CLOSE_BRACKET];
    var XML_DECL_NAME_TERMINATOR = [EQUAL, QUESTION, ...S_LIST];
    var ATTRIB_VALUE_UNQUOTED_TERMINATOR = [...S_LIST, GREATER, AMP, LESS];
    function nsPairCheck(parser, prefix2, uri) {
      switch (prefix2) {
        case "xml":
          if (uri !== XML_NAMESPACE) {
            parser.fail(`xml prefix must be bound to ${XML_NAMESPACE}.`);
          }
          break;
        case "xmlns":
          if (uri !== XMLNS_NAMESPACE) {
            parser.fail(`xmlns prefix must be bound to ${XMLNS_NAMESPACE}.`);
          }
          break;
        default:
      }
      switch (uri) {
        case XMLNS_NAMESPACE:
          parser.fail(prefix2 === "" ? `the default namespace may not be set to ${uri}.` : `may not assign a prefix (even "xmlns") to the URI ${XMLNS_NAMESPACE}.`);
          break;
        case XML_NAMESPACE:
          switch (prefix2) {
            case "xml":
              break;
            case "":
              parser.fail(`the default namespace may not be set to ${uri}.`);
              break;
            default:
              parser.fail("may not assign the xml namespace to another prefix.");
          }
          break;
        default:
      }
    }
    function nsMappingCheck(parser, mapping) {
      for (const local of Object.keys(mapping)) {
        nsPairCheck(parser, local, mapping[local]);
      }
    }
    var isNCName = (name2) => NC_NAME_RE.test(name2);
    var isName = (name2) => NAME_RE.test(name2);
    var FORBIDDEN_START = 0;
    var FORBIDDEN_BRACKET = 1;
    var FORBIDDEN_BRACKET_BRACKET = 2;
    exports.EVENTS = [
      "xmldecl",
      "text",
      "processinginstruction",
      "doctype",
      "comment",
      "opentagstart",
      "attribute",
      "opentag",
      "closetag",
      "cdata",
      "error",
      "end",
      "ready"
    ];
    var EVENT_NAME_TO_HANDLER_NAME = {
      xmldecl: "xmldeclHandler",
      text: "textHandler",
      processinginstruction: "piHandler",
      doctype: "doctypeHandler",
      comment: "commentHandler",
      opentagstart: "openTagStartHandler",
      attribute: "attributeHandler",
      opentag: "openTagHandler",
      closetag: "closeTagHandler",
      cdata: "cdataHandler",
      error: "errorHandler",
      end: "endHandler",
      ready: "readyHandler"
    };
    var SaxesParser2 = class {
      /**
       * @param opt The parser options.
       */
      constructor(opt) {
        this.opt = opt !== null && opt !== void 0 ? opt : {};
        this.fragmentOpt = !!this.opt.fragment;
        const xmlnsOpt = this.xmlnsOpt = !!this.opt.xmlns;
        this.trackPosition = this.opt.position !== false;
        this.fileName = this.opt.fileName;
        if (xmlnsOpt) {
          this.nameStartCheck = isNCNameStartChar;
          this.nameCheck = isNCNameChar;
          this.isName = isNCName;
          this.processAttribs = this.processAttribsNS;
          this.pushAttrib = this.pushAttribNS;
          this.ns = Object.assign({ __proto__: null }, rootNS);
          const additional = this.opt.additionalNamespaces;
          if (additional != null) {
            nsMappingCheck(this, additional);
            Object.assign(this.ns, additional);
          }
        } else {
          this.nameStartCheck = isNameStartChar;
          this.nameCheck = isNameChar;
          this.isName = isName;
          this.processAttribs = this.processAttribsPlain;
          this.pushAttrib = this.pushAttribPlain;
        }
        this.stateTable = [
          /* eslint-disable @typescript-eslint/unbound-method */
          this.sBegin,
          this.sBeginWhitespace,
          this.sDoctype,
          this.sDoctypeQuote,
          this.sDTD,
          this.sDTDQuoted,
          this.sDTDOpenWaka,
          this.sDTDOpenWakaBang,
          this.sDTDComment,
          this.sDTDCommentEnding,
          this.sDTDCommentEnded,
          this.sDTDPI,
          this.sDTDPIEnding,
          this.sText,
          this.sEntity,
          this.sOpenWaka,
          this.sOpenWakaBang,
          this.sComment,
          this.sCommentEnding,
          this.sCommentEnded,
          this.sCData,
          this.sCDataEnding,
          this.sCDataEnding2,
          this.sPIFirstChar,
          this.sPIRest,
          this.sPIBody,
          this.sPIEnding,
          this.sXMLDeclNameStart,
          this.sXMLDeclName,
          this.sXMLDeclEq,
          this.sXMLDeclValueStart,
          this.sXMLDeclValue,
          this.sXMLDeclSeparator,
          this.sXMLDeclEnding,
          this.sOpenTag,
          this.sOpenTagSlash,
          this.sAttrib,
          this.sAttribName,
          this.sAttribNameSawWhite,
          this.sAttribValue,
          this.sAttribValueQuoted,
          this.sAttribValueClosed,
          this.sAttribValueUnquoted,
          this.sCloseTag,
          this.sCloseTagSawWhite
          /* eslint-enable @typescript-eslint/unbound-method */
        ];
        this._init();
      }
      /**
       * Indicates whether or not the parser is closed. If ``true``, wait for
       * the ``ready`` event to write again.
       */
      get closed() {
        return this._closed;
      }
      _init() {
        var _a;
        this.openWakaBang = "";
        this.text = "";
        this.name = "";
        this.piTarget = "";
        this.entity = "";
        this.q = null;
        this.tags = [];
        this.tag = null;
        this.topNS = null;
        this.chunk = "";
        this.chunkPosition = 0;
        this.i = 0;
        this.prevI = 0;
        this.carriedFromPrevious = void 0;
        this.forbiddenState = FORBIDDEN_START;
        this.attribList = [];
        const { fragmentOpt } = this;
        this.state = fragmentOpt ? S_TEXT : S_BEGIN;
        this.reportedTextBeforeRoot = this.reportedTextAfterRoot = this.closedRoot = this.sawRoot = fragmentOpt;
        this.xmlDeclPossible = !fragmentOpt;
        this.xmlDeclExpects = ["version"];
        this.entityReturnState = void 0;
        let { defaultXMLVersion } = this.opt;
        if (defaultXMLVersion === void 0) {
          if (this.opt.forceXMLVersion === true) {
            throw new Error("forceXMLVersion set but defaultXMLVersion is not set");
          }
          defaultXMLVersion = "1.0";
        }
        this.setXMLVersion(defaultXMLVersion);
        this.positionAtNewLine = 0;
        this.doctype = false;
        this._closed = false;
        this.xmlDecl = {
          version: void 0,
          encoding: void 0,
          standalone: void 0
        };
        this.line = 1;
        this.column = 0;
        this.ENTITIES = Object.create(XML_ENTITIES);
        (_a = this.readyHandler) === null || _a === void 0 ? void 0 : _a.call(this);
      }
      /**
       * The stream position the parser is currently looking at. This field is
       * zero-based.
       *
       * This field is not based on counting Unicode characters but is to be
       * interpreted as a plain index into a JavaScript string.
       */
      get position() {
        return this.chunkPosition + this.i;
      }
      /**
       * The column number of the next character to be read by the parser.  *
       * This field is zero-based. (The first column in a line is 0.)
       *
       * This field reports the index at which the next character would be in the
       * line if the line were represented as a JavaScript string.  Note that this
       * *can* be different to a count based on the number of *Unicode characters*
       * due to how JavaScript handles astral plane characters.
       *
       * See [[column]] for a number that corresponds to a count of Unicode
       * characters.
       */
      get columnIndex() {
        return this.position - this.positionAtNewLine;
      }
      /**
       * Set an event listener on an event. The parser supports one handler per
       * event type. If you try to set an event handler over an existing handler,
       * the old handler is silently overwritten.
       *
       * @param name The event to listen to.
       *
       * @param handler The handler to set.
       */
      on(name2, handler) {
        this[EVENT_NAME_TO_HANDLER_NAME[name2]] = handler;
      }
      /**
       * Unset an event handler.
       *
       * @parma name The event to stop listening to.
       */
      off(name2) {
        this[EVENT_NAME_TO_HANDLER_NAME[name2]] = void 0;
      }
      /**
       * Make an error object. The error object will have a message that contains
       * the ``fileName`` option passed at the creation of the parser. If position
       * tracking was turned on, it will also have line and column number
       * information.
       *
       * @param message The message describing the error to report.
       *
       * @returns An error object with a properly formatted message.
       */
      makeError(message) {
        var _a;
        let msg = (_a = this.fileName) !== null && _a !== void 0 ? _a : "";
        if (this.trackPosition) {
          if (msg.length > 0) {
            msg += ":";
          }
          msg += `${this.line}:${this.column}`;
        }
        if (msg.length > 0) {
          msg += ": ";
        }
        return new Error(msg + message);
      }
      /**
       * Report a parsing error. This method is made public so that client code may
       * check for issues that are outside the scope of this project and can report
       * errors.
       *
       * @param message The error to report.
       *
       * @returns this
       */
      fail(message) {
        const err = this.makeError(message);
        const handler = this.errorHandler;
        if (handler === void 0) {
          throw err;
        } else {
          handler(err);
        }
        return this;
      }
      /**
       * Write a XML data to the parser.
       *
       * @param chunk The XML data to write.
       *
       * @returns this
       */
      // We do need object for the type here. Yes, it often causes problems
      // but not in this case.
      write(chunk2) {
        if (this.closed) {
          return this.fail("cannot write after close; assign an onready handler.");
        }
        let end = false;
        if (chunk2 === null) {
          end = true;
          chunk2 = "";
        } else if (typeof chunk2 === "object") {
          chunk2 = chunk2.toString();
        }
        if (this.carriedFromPrevious !== void 0) {
          chunk2 = `${this.carriedFromPrevious}${chunk2}`;
          this.carriedFromPrevious = void 0;
        }
        let limit4 = chunk2.length;
        const lastCode = chunk2.charCodeAt(limit4 - 1);
        if (!end && // A trailing CR or surrogate must be carried over to the next
        // chunk.
        (lastCode === CR || lastCode >= 55296 && lastCode <= 56319)) {
          this.carriedFromPrevious = chunk2[limit4 - 1];
          limit4--;
          chunk2 = chunk2.slice(0, limit4);
        }
        const { stateTable } = this;
        this.chunk = chunk2;
        this.i = 0;
        while (this.i < limit4) {
          stateTable[this.state].call(this);
        }
        this.chunkPosition += limit4;
        return end ? this.end() : this;
      }
      /**
       * Close the current stream. Perform final well-formedness checks and reset
       * the parser tstate.
       *
       * @returns this
       */
      close() {
        return this.write(null);
      }
      /**
       * Get a single code point out of the current chunk. This updates the current
       * position if we do position tracking.
       *
       * This is the algorithm to use for XML 1.0.
       *
       * @returns The character read.
       */
      getCode10() {
        const { chunk: chunk2, i } = this;
        this.prevI = i;
        this.i = i + 1;
        if (i >= chunk2.length) {
          return EOC;
        }
        const code = chunk2.charCodeAt(i);
        this.column++;
        if (code < 55296) {
          if (code >= SPACE || code === TAB) {
            return code;
          }
          switch (code) {
            case NL:
              this.line++;
              this.column = 0;
              this.positionAtNewLine = this.position;
              return NL;
            case CR:
              if (chunk2.charCodeAt(i + 1) === NL) {
                this.i = i + 2;
              }
              this.line++;
              this.column = 0;
              this.positionAtNewLine = this.position;
              return NL_LIKE;
            default:
              this.fail("disallowed character.");
              return code;
          }
        }
        if (code > 56319) {
          if (!(code >= 57344 && code <= 65533)) {
            this.fail("disallowed character.");
          }
          return code;
        }
        const final = 65536 + (code - 55296) * 1024 + (chunk2.charCodeAt(i + 1) - 56320);
        this.i = i + 2;
        if (final > 1114111) {
          this.fail("disallowed character.");
        }
        return final;
      }
      /**
       * Get a single code point out of the current chunk. This updates the current
       * position if we do position tracking.
       *
       * This is the algorithm to use for XML 1.1.
       *
       * @returns {number} The character read.
       */
      getCode11() {
        const { chunk: chunk2, i } = this;
        this.prevI = i;
        this.i = i + 1;
        if (i >= chunk2.length) {
          return EOC;
        }
        const code = chunk2.charCodeAt(i);
        this.column++;
        if (code < 55296) {
          if (code > 31 && code < 127 || code > 159 && code !== LS || code === TAB) {
            return code;
          }
          switch (code) {
            case NL:
              this.line++;
              this.column = 0;
              this.positionAtNewLine = this.position;
              return NL;
            case CR: {
              const next = chunk2.charCodeAt(i + 1);
              if (next === NL || next === NEL) {
                this.i = i + 2;
              }
            }
            /* yes, fall through */
            case NEL:
            // 0x85
            case LS:
              this.line++;
              this.column = 0;
              this.positionAtNewLine = this.position;
              return NL_LIKE;
            default:
              this.fail("disallowed character.");
              return code;
          }
        }
        if (code > 56319) {
          if (!(code >= 57344 && code <= 65533)) {
            this.fail("disallowed character.");
          }
          return code;
        }
        const final = 65536 + (code - 55296) * 1024 + (chunk2.charCodeAt(i + 1) - 56320);
        this.i = i + 2;
        if (final > 1114111) {
          this.fail("disallowed character.");
        }
        return final;
      }
      /**
       * Like ``getCode`` but with the return value normalized so that ``NL`` is
       * returned for ``NL_LIKE``.
       */
      getCodeNorm() {
        const c = this.getCode();
        return c === NL_LIKE ? NL : c;
      }
      unget() {
        this.i = this.prevI;
        this.column--;
      }
      /**
       * Capture characters into a buffer until encountering one of a set of
       * characters.
       *
       * @param chars An array of codepoints. Encountering a character in the array
       * ends the capture. (``chars`` may safely contain ``NL``.)
       *
       * @return The character code that made the capture end, or ``EOC`` if we hit
       * the end of the chunk. The return value cannot be NL_LIKE: NL is returned
       * instead.
       */
      captureTo(chars) {
        let { i: start } = this;
        const { chunk: chunk2 } = this;
        while (true) {
          const c = this.getCode();
          const isNLLike = c === NL_LIKE;
          const final = isNLLike ? NL : c;
          if (final === EOC || chars.includes(final)) {
            this.text += chunk2.slice(start, this.prevI);
            return final;
          }
          if (isNLLike) {
            this.text += `${chunk2.slice(start, this.prevI)}
`;
            start = this.i;
          }
        }
      }
      /**
       * Capture characters into a buffer until encountering a character.
       *
       * @param char The codepoint that ends the capture. **NOTE ``char`` MAY NOT
       * CONTAIN ``NL``.** Passing ``NL`` will result in buggy behavior.
       *
       * @return ``true`` if we ran into the character. Otherwise, we ran into the
       * end of the current chunk.
       */
      captureToChar(char) {
        let { i: start } = this;
        const { chunk: chunk2 } = this;
        while (true) {
          let c = this.getCode();
          switch (c) {
            case NL_LIKE:
              this.text += `${chunk2.slice(start, this.prevI)}
`;
              start = this.i;
              c = NL;
              break;
            case EOC:
              this.text += chunk2.slice(start);
              return false;
            default:
          }
          if (c === char) {
            this.text += chunk2.slice(start, this.prevI);
            return true;
          }
        }
      }
      /**
       * Capture characters that satisfy ``isNameChar`` into the ``name`` field of
       * this parser.
       *
       * @return The character code that made the test fail, or ``EOC`` if we hit
       * the end of the chunk. The return value cannot be NL_LIKE: NL is returned
       * instead.
       */
      captureNameChars() {
        const { chunk: chunk2, i: start } = this;
        while (true) {
          const c = this.getCode();
          if (c === EOC) {
            this.name += chunk2.slice(start);
            return EOC;
          }
          if (!isNameChar(c)) {
            this.name += chunk2.slice(start, this.prevI);
            return c === NL_LIKE ? NL : c;
          }
        }
      }
      /**
       * Skip white spaces.
       *
       * @return The character that ended the skip, or ``EOC`` if we hit
       * the end of the chunk. The return value cannot be NL_LIKE: NL is returned
       * instead.
       */
      skipSpaces() {
        while (true) {
          const c = this.getCodeNorm();
          if (c === EOC || !isS(c)) {
            return c;
          }
        }
      }
      setXMLVersion(version) {
        this.currentXMLVersion = version;
        if (version === "1.0") {
          this.isChar = isChar10;
          this.getCode = this.getCode10;
        } else {
          this.isChar = isChar11;
          this.getCode = this.getCode11;
        }
      }
      // STATE ENGINE METHODS
      // This needs to be a state separate from S_BEGIN_WHITESPACE because we want
      // to be sure never to come back to this state later.
      sBegin() {
        if (this.chunk.charCodeAt(0) === 65279) {
          this.i++;
          this.column++;
        }
        this.state = S_BEGIN_WHITESPACE;
      }
      sBeginWhitespace() {
        const iBefore = this.i;
        const c = this.skipSpaces();
        if (this.prevI !== iBefore) {
          this.xmlDeclPossible = false;
        }
        switch (c) {
          case LESS:
            this.state = S_OPEN_WAKA;
            if (this.text.length !== 0) {
              throw new Error("no-empty text at start");
            }
            break;
          case EOC:
            break;
          default:
            this.unget();
            this.state = S_TEXT;
            this.xmlDeclPossible = false;
        }
      }
      sDoctype() {
        var _a;
        const c = this.captureTo(DOCTYPE_TERMINATOR);
        switch (c) {
          case GREATER: {
            (_a = this.doctypeHandler) === null || _a === void 0 ? void 0 : _a.call(this, this.text);
            this.text = "";
            this.state = S_TEXT;
            this.doctype = true;
            break;
          }
          case EOC:
            break;
          default:
            this.text += String.fromCodePoint(c);
            if (c === OPEN_BRACKET) {
              this.state = S_DTD;
            } else if (isQuote(c)) {
              this.state = S_DOCTYPE_QUOTE;
              this.q = c;
            }
        }
      }
      sDoctypeQuote() {
        const q = this.q;
        if (this.captureToChar(q)) {
          this.text += String.fromCodePoint(q);
          this.q = null;
          this.state = S_DOCTYPE;
        }
      }
      sDTD() {
        const c = this.captureTo(DTD_TERMINATOR);
        if (c === EOC) {
          return;
        }
        this.text += String.fromCodePoint(c);
        if (c === CLOSE_BRACKET) {
          this.state = S_DOCTYPE;
        } else if (c === LESS) {
          this.state = S_DTD_OPEN_WAKA;
        } else if (isQuote(c)) {
          this.state = S_DTD_QUOTED;
          this.q = c;
        }
      }
      sDTDQuoted() {
        const q = this.q;
        if (this.captureToChar(q)) {
          this.text += String.fromCodePoint(q);
          this.state = S_DTD;
          this.q = null;
        }
      }
      sDTDOpenWaka() {
        const c = this.getCodeNorm();
        this.text += String.fromCodePoint(c);
        switch (c) {
          case BANG:
            this.state = S_DTD_OPEN_WAKA_BANG;
            this.openWakaBang = "";
            break;
          case QUESTION:
            this.state = S_DTD_PI;
            break;
          default:
            this.state = S_DTD;
        }
      }
      sDTDOpenWakaBang() {
        const char = String.fromCodePoint(this.getCodeNorm());
        const owb = this.openWakaBang += char;
        this.text += char;
        if (owb !== "-") {
          this.state = owb === "--" ? S_DTD_COMMENT : S_DTD;
          this.openWakaBang = "";
        }
      }
      sDTDComment() {
        if (this.captureToChar(MINUS)) {
          this.text += "-";
          this.state = S_DTD_COMMENT_ENDING;
        }
      }
      sDTDCommentEnding() {
        const c = this.getCodeNorm();
        this.text += String.fromCodePoint(c);
        this.state = c === MINUS ? S_DTD_COMMENT_ENDED : S_DTD_COMMENT;
      }
      sDTDCommentEnded() {
        const c = this.getCodeNorm();
        this.text += String.fromCodePoint(c);
        if (c === GREATER) {
          this.state = S_DTD;
        } else {
          this.fail("malformed comment.");
          this.state = S_DTD_COMMENT;
        }
      }
      sDTDPI() {
        if (this.captureToChar(QUESTION)) {
          this.text += "?";
          this.state = S_DTD_PI_ENDING;
        }
      }
      sDTDPIEnding() {
        const c = this.getCodeNorm();
        this.text += String.fromCodePoint(c);
        if (c === GREATER) {
          this.state = S_DTD;
        }
      }
      sText() {
        if (this.tags.length !== 0) {
          this.handleTextInRoot();
        } else {
          this.handleTextOutsideRoot();
        }
      }
      sEntity() {
        let { i: start } = this;
        const { chunk: chunk2 } = this;
        loop:
          while (true) {
            switch (this.getCode()) {
              case NL_LIKE:
                this.entity += `${chunk2.slice(start, this.prevI)}
`;
                start = this.i;
                break;
              case SEMICOLON: {
                const { entityReturnState } = this;
                const entity = this.entity + chunk2.slice(start, this.prevI);
                this.state = entityReturnState;
                let parsed;
                if (entity === "") {
                  this.fail("empty entity name.");
                  parsed = "&;";
                } else {
                  parsed = this.parseEntity(entity);
                  this.entity = "";
                }
                if (entityReturnState !== S_TEXT || this.textHandler !== void 0) {
                  this.text += parsed;
                }
                break loop;
              }
              case EOC:
                this.entity += chunk2.slice(start);
                break loop;
              default:
            }
          }
      }
      sOpenWaka() {
        const c = this.getCode();
        if (isNameStartChar(c)) {
          this.state = S_OPEN_TAG;
          this.unget();
          this.xmlDeclPossible = false;
        } else {
          switch (c) {
            case FORWARD_SLASH:
              this.state = S_CLOSE_TAG;
              this.xmlDeclPossible = false;
              break;
            case BANG:
              this.state = S_OPEN_WAKA_BANG;
              this.openWakaBang = "";
              this.xmlDeclPossible = false;
              break;
            case QUESTION:
              this.state = S_PI_FIRST_CHAR;
              break;
            default:
              this.fail("disallowed character in tag name");
              this.state = S_TEXT;
              this.xmlDeclPossible = false;
          }
        }
      }
      sOpenWakaBang() {
        this.openWakaBang += String.fromCodePoint(this.getCodeNorm());
        switch (this.openWakaBang) {
          case "[CDATA[":
            if (!this.sawRoot && !this.reportedTextBeforeRoot) {
              this.fail("text data outside of root node.");
              this.reportedTextBeforeRoot = true;
            }
            if (this.closedRoot && !this.reportedTextAfterRoot) {
              this.fail("text data outside of root node.");
              this.reportedTextAfterRoot = true;
            }
            this.state = S_CDATA;
            this.openWakaBang = "";
            break;
          case "--":
            this.state = S_COMMENT;
            this.openWakaBang = "";
            break;
          case "DOCTYPE":
            this.state = S_DOCTYPE;
            if (this.doctype || this.sawRoot) {
              this.fail("inappropriately located doctype declaration.");
            }
            this.openWakaBang = "";
            break;
          default:
            if (this.openWakaBang.length >= 7) {
              this.fail("incorrect syntax.");
            }
        }
      }
      sComment() {
        if (this.captureToChar(MINUS)) {
          this.state = S_COMMENT_ENDING;
        }
      }
      sCommentEnding() {
        var _a;
        const c = this.getCodeNorm();
        if (c === MINUS) {
          this.state = S_COMMENT_ENDED;
          (_a = this.commentHandler) === null || _a === void 0 ? void 0 : _a.call(this, this.text);
          this.text = "";
        } else {
          this.text += `-${String.fromCodePoint(c)}`;
          this.state = S_COMMENT;
        }
      }
      sCommentEnded() {
        const c = this.getCodeNorm();
        if (c !== GREATER) {
          this.fail("malformed comment.");
          this.text += `--${String.fromCodePoint(c)}`;
          this.state = S_COMMENT;
        } else {
          this.state = S_TEXT;
        }
      }
      sCData() {
        if (this.captureToChar(CLOSE_BRACKET)) {
          this.state = S_CDATA_ENDING;
        }
      }
      sCDataEnding() {
        const c = this.getCodeNorm();
        if (c === CLOSE_BRACKET) {
          this.state = S_CDATA_ENDING_2;
        } else {
          this.text += `]${String.fromCodePoint(c)}`;
          this.state = S_CDATA;
        }
      }
      sCDataEnding2() {
        var _a;
        const c = this.getCodeNorm();
        switch (c) {
          case GREATER: {
            (_a = this.cdataHandler) === null || _a === void 0 ? void 0 : _a.call(this, this.text);
            this.text = "";
            this.state = S_TEXT;
            break;
          }
          case CLOSE_BRACKET:
            this.text += "]";
            break;
          default:
            this.text += `]]${String.fromCodePoint(c)}`;
            this.state = S_CDATA;
        }
      }
      // We need this separate state to check the first character fo the pi target
      // with this.nameStartCheck which allows less characters than this.nameCheck.
      sPIFirstChar() {
        const c = this.getCodeNorm();
        if (this.nameStartCheck(c)) {
          this.piTarget += String.fromCodePoint(c);
          this.state = S_PI_REST;
        } else if (c === QUESTION || isS(c)) {
          this.fail("processing instruction without a target.");
          this.state = c === QUESTION ? S_PI_ENDING : S_PI_BODY;
        } else {
          this.fail("disallowed character in processing instruction name.");
          this.piTarget += String.fromCodePoint(c);
          this.state = S_PI_REST;
        }
      }
      sPIRest() {
        const { chunk: chunk2, i: start } = this;
        while (true) {
          const c = this.getCodeNorm();
          if (c === EOC) {
            this.piTarget += chunk2.slice(start);
            return;
          }
          if (!this.nameCheck(c)) {
            this.piTarget += chunk2.slice(start, this.prevI);
            const isQuestion = c === QUESTION;
            if (isQuestion || isS(c)) {
              if (this.piTarget === "xml") {
                if (!this.xmlDeclPossible) {
                  this.fail("an XML declaration must be at the start of the document.");
                }
                this.state = isQuestion ? S_XML_DECL_ENDING : S_XML_DECL_NAME_START;
              } else {
                this.state = isQuestion ? S_PI_ENDING : S_PI_BODY;
              }
            } else {
              this.fail("disallowed character in processing instruction name.");
              this.piTarget += String.fromCodePoint(c);
            }
            break;
          }
        }
      }
      sPIBody() {
        if (this.text.length === 0) {
          const c = this.getCodeNorm();
          if (c === QUESTION) {
            this.state = S_PI_ENDING;
          } else if (!isS(c)) {
            this.text = String.fromCodePoint(c);
          }
        } else if (this.captureToChar(QUESTION)) {
          this.state = S_PI_ENDING;
        }
      }
      sPIEnding() {
        var _a;
        const c = this.getCodeNorm();
        if (c === GREATER) {
          const { piTarget } = this;
          if (piTarget.toLowerCase() === "xml") {
            this.fail("the XML declaration must appear at the start of the document.");
          }
          (_a = this.piHandler) === null || _a === void 0 ? void 0 : _a.call(this, {
            target: piTarget,
            body: this.text
          });
          this.piTarget = this.text = "";
          this.state = S_TEXT;
        } else if (c === QUESTION) {
          this.text += "?";
        } else {
          this.text += `?${String.fromCodePoint(c)}`;
          this.state = S_PI_BODY;
        }
        this.xmlDeclPossible = false;
      }
      sXMLDeclNameStart() {
        const c = this.skipSpaces();
        if (c === QUESTION) {
          this.state = S_XML_DECL_ENDING;
          return;
        }
        if (c !== EOC) {
          this.state = S_XML_DECL_NAME;
          this.name = String.fromCodePoint(c);
        }
      }
      sXMLDeclName() {
        const c = this.captureTo(XML_DECL_NAME_TERMINATOR);
        if (c === QUESTION) {
          this.state = S_XML_DECL_ENDING;
          this.name += this.text;
          this.text = "";
          this.fail("XML declaration is incomplete.");
          return;
        }
        if (!(isS(c) || c === EQUAL)) {
          return;
        }
        this.name += this.text;
        this.text = "";
        if (!this.xmlDeclExpects.includes(this.name)) {
          switch (this.name.length) {
            case 0:
              this.fail("did not expect any more name/value pairs.");
              break;
            case 1:
              this.fail(`expected the name ${this.xmlDeclExpects[0]}.`);
              break;
            default:
              this.fail(`expected one of ${this.xmlDeclExpects.join(", ")}`);
          }
        }
        this.state = c === EQUAL ? S_XML_DECL_VALUE_START : S_XML_DECL_EQ;
      }
      sXMLDeclEq() {
        const c = this.getCodeNorm();
        if (c === QUESTION) {
          this.state = S_XML_DECL_ENDING;
          this.fail("XML declaration is incomplete.");
          return;
        }
        if (isS(c)) {
          return;
        }
        if (c !== EQUAL) {
          this.fail("value required.");
        }
        this.state = S_XML_DECL_VALUE_START;
      }
      sXMLDeclValueStart() {
        const c = this.getCodeNorm();
        if (c === QUESTION) {
          this.state = S_XML_DECL_ENDING;
          this.fail("XML declaration is incomplete.");
          return;
        }
        if (isS(c)) {
          return;
        }
        if (!isQuote(c)) {
          this.fail("value must be quoted.");
          this.q = SPACE;
        } else {
          this.q = c;
        }
        this.state = S_XML_DECL_VALUE;
      }
      sXMLDeclValue() {
        const c = this.captureTo([this.q, QUESTION]);
        if (c === QUESTION) {
          this.state = S_XML_DECL_ENDING;
          this.text = "";
          this.fail("XML declaration is incomplete.");
          return;
        }
        if (c === EOC) {
          return;
        }
        const value = this.text;
        this.text = "";
        switch (this.name) {
          case "version": {
            this.xmlDeclExpects = ["encoding", "standalone"];
            const version = value;
            this.xmlDecl.version = version;
            if (!/^1\.[0-9]+$/.test(version)) {
              this.fail("version number must match /^1\\.[0-9]+$/.");
            } else if (!this.opt.forceXMLVersion) {
              this.setXMLVersion(version);
            }
            break;
          }
          case "encoding":
            if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(value)) {
              this.fail("encoding value must match /^[A-Za-z0-9][A-Za-z0-9._-]*$/.");
            }
            this.xmlDeclExpects = ["standalone"];
            this.xmlDecl.encoding = value;
            break;
          case "standalone":
            if (value !== "yes" && value !== "no") {
              this.fail('standalone value must match "yes" or "no".');
            }
            this.xmlDeclExpects = [];
            this.xmlDecl.standalone = value;
            break;
          default:
        }
        this.name = "";
        this.state = S_XML_DECL_SEPARATOR;
      }
      sXMLDeclSeparator() {
        const c = this.getCodeNorm();
        if (c === QUESTION) {
          this.state = S_XML_DECL_ENDING;
          return;
        }
        if (!isS(c)) {
          this.fail("whitespace required.");
          this.unget();
        }
        this.state = S_XML_DECL_NAME_START;
      }
      sXMLDeclEnding() {
        var _a;
        const c = this.getCodeNorm();
        if (c === GREATER) {
          if (this.piTarget !== "xml") {
            this.fail("processing instructions are not allowed before root.");
          } else if (this.name !== "version" && this.xmlDeclExpects.includes("version")) {
            this.fail("XML declaration must contain a version.");
          }
          (_a = this.xmldeclHandler) === null || _a === void 0 ? void 0 : _a.call(this, this.xmlDecl);
          this.name = "";
          this.piTarget = this.text = "";
          this.state = S_TEXT;
        } else {
          this.fail("The character ? is disallowed anywhere in XML declarations.");
        }
        this.xmlDeclPossible = false;
      }
      sOpenTag() {
        var _a;
        const c = this.captureNameChars();
        if (c === EOC) {
          return;
        }
        const tag = this.tag = {
          name: this.name,
          attributes: /* @__PURE__ */ Object.create(null)
        };
        this.name = "";
        if (this.xmlnsOpt) {
          this.topNS = tag.ns = /* @__PURE__ */ Object.create(null);
        }
        (_a = this.openTagStartHandler) === null || _a === void 0 ? void 0 : _a.call(this, tag);
        this.sawRoot = true;
        if (!this.fragmentOpt && this.closedRoot) {
          this.fail("documents may contain only one root.");
        }
        switch (c) {
          case GREATER:
            this.openTag();
            break;
          case FORWARD_SLASH:
            this.state = S_OPEN_TAG_SLASH;
            break;
          default:
            if (!isS(c)) {
              this.fail("disallowed character in tag name.");
            }
            this.state = S_ATTRIB;
        }
      }
      sOpenTagSlash() {
        if (this.getCode() === GREATER) {
          this.openSelfClosingTag();
        } else {
          this.fail("forward-slash in opening tag not followed by >.");
          this.state = S_ATTRIB;
        }
      }
      sAttrib() {
        const c = this.skipSpaces();
        if (c === EOC) {
          return;
        }
        if (isNameStartChar(c)) {
          this.unget();
          this.state = S_ATTRIB_NAME;
        } else if (c === GREATER) {
          this.openTag();
        } else if (c === FORWARD_SLASH) {
          this.state = S_OPEN_TAG_SLASH;
        } else {
          this.fail("disallowed character in attribute name.");
        }
      }
      sAttribName() {
        const c = this.captureNameChars();
        if (c === EQUAL) {
          this.state = S_ATTRIB_VALUE;
        } else if (isS(c)) {
          this.state = S_ATTRIB_NAME_SAW_WHITE;
        } else if (c === GREATER) {
          this.fail("attribute without value.");
          this.pushAttrib(this.name, this.name);
          this.name = this.text = "";
          this.openTag();
        } else if (c !== EOC) {
          this.fail("disallowed character in attribute name.");
        }
      }
      sAttribNameSawWhite() {
        const c = this.skipSpaces();
        switch (c) {
          case EOC:
            return;
          case EQUAL:
            this.state = S_ATTRIB_VALUE;
            break;
          default:
            this.fail("attribute without value.");
            this.text = "";
            this.name = "";
            if (c === GREATER) {
              this.openTag();
            } else if (isNameStartChar(c)) {
              this.unget();
              this.state = S_ATTRIB_NAME;
            } else {
              this.fail("disallowed character in attribute name.");
              this.state = S_ATTRIB;
            }
        }
      }
      sAttribValue() {
        const c = this.getCodeNorm();
        if (isQuote(c)) {
          this.q = c;
          this.state = S_ATTRIB_VALUE_QUOTED;
        } else if (!isS(c)) {
          this.fail("unquoted attribute value.");
          this.state = S_ATTRIB_VALUE_UNQUOTED;
          this.unget();
        }
      }
      sAttribValueQuoted() {
        const { q, chunk: chunk2 } = this;
        let { i: start } = this;
        while (true) {
          switch (this.getCode()) {
            case q:
              this.pushAttrib(this.name, this.text + chunk2.slice(start, this.prevI));
              this.name = this.text = "";
              this.q = null;
              this.state = S_ATTRIB_VALUE_CLOSED;
              return;
            case AMP:
              this.text += chunk2.slice(start, this.prevI);
              this.state = S_ENTITY;
              this.entityReturnState = S_ATTRIB_VALUE_QUOTED;
              return;
            case NL:
            case NL_LIKE:
            case TAB:
              this.text += `${chunk2.slice(start, this.prevI)} `;
              start = this.i;
              break;
            case LESS:
              this.text += chunk2.slice(start, this.prevI);
              this.fail("disallowed character.");
              return;
            case EOC:
              this.text += chunk2.slice(start);
              return;
            default:
          }
        }
      }
      sAttribValueClosed() {
        const c = this.getCodeNorm();
        if (isS(c)) {
          this.state = S_ATTRIB;
        } else if (c === GREATER) {
          this.openTag();
        } else if (c === FORWARD_SLASH) {
          this.state = S_OPEN_TAG_SLASH;
        } else if (isNameStartChar(c)) {
          this.fail("no whitespace between attributes.");
          this.unget();
          this.state = S_ATTRIB_NAME;
        } else {
          this.fail("disallowed character in attribute name.");
        }
      }
      sAttribValueUnquoted() {
        const c = this.captureTo(ATTRIB_VALUE_UNQUOTED_TERMINATOR);
        switch (c) {
          case AMP:
            this.state = S_ENTITY;
            this.entityReturnState = S_ATTRIB_VALUE_UNQUOTED;
            break;
          case LESS:
            this.fail("disallowed character.");
            break;
          case EOC:
            break;
          default:
            if (this.text.includes("]]>")) {
              this.fail('the string "]]>" is disallowed in char data.');
            }
            this.pushAttrib(this.name, this.text);
            this.name = this.text = "";
            if (c === GREATER) {
              this.openTag();
            } else {
              this.state = S_ATTRIB;
            }
        }
      }
      sCloseTag() {
        const c = this.captureNameChars();
        if (c === GREATER) {
          this.closeTag();
        } else if (isS(c)) {
          this.state = S_CLOSE_TAG_SAW_WHITE;
        } else if (c !== EOC) {
          this.fail("disallowed character in closing tag.");
        }
      }
      sCloseTagSawWhite() {
        switch (this.skipSpaces()) {
          case GREATER:
            this.closeTag();
            break;
          case EOC:
            break;
          default:
            this.fail("disallowed character in closing tag.");
        }
      }
      // END OF STATE ENGINE METHODS
      handleTextInRoot() {
        let { i: start, forbiddenState } = this;
        const { chunk: chunk2, textHandler: handler } = this;
        scanLoop:
          while (true) {
            switch (this.getCode()) {
              case LESS: {
                this.state = S_OPEN_WAKA;
                if (handler !== void 0) {
                  const { text: text2 } = this;
                  const slice = chunk2.slice(start, this.prevI);
                  if (text2.length !== 0) {
                    handler(text2 + slice);
                    this.text = "";
                  } else if (slice.length !== 0) {
                    handler(slice);
                  }
                }
                forbiddenState = FORBIDDEN_START;
                break scanLoop;
              }
              case AMP:
                this.state = S_ENTITY;
                this.entityReturnState = S_TEXT;
                if (handler !== void 0) {
                  this.text += chunk2.slice(start, this.prevI);
                }
                forbiddenState = FORBIDDEN_START;
                break scanLoop;
              case CLOSE_BRACKET:
                switch (forbiddenState) {
                  case FORBIDDEN_START:
                    forbiddenState = FORBIDDEN_BRACKET;
                    break;
                  case FORBIDDEN_BRACKET:
                    forbiddenState = FORBIDDEN_BRACKET_BRACKET;
                    break;
                  case FORBIDDEN_BRACKET_BRACKET:
                    break;
                  default:
                    throw new Error("impossible state");
                }
                break;
              case GREATER:
                if (forbiddenState === FORBIDDEN_BRACKET_BRACKET) {
                  this.fail('the string "]]>" is disallowed in char data.');
                }
                forbiddenState = FORBIDDEN_START;
                break;
              case NL_LIKE:
                if (handler !== void 0) {
                  this.text += `${chunk2.slice(start, this.prevI)}
`;
                }
                start = this.i;
                forbiddenState = FORBIDDEN_START;
                break;
              case EOC:
                if (handler !== void 0) {
                  this.text += chunk2.slice(start);
                }
                break scanLoop;
              default:
                forbiddenState = FORBIDDEN_START;
            }
          }
        this.forbiddenState = forbiddenState;
      }
      handleTextOutsideRoot() {
        let { i: start } = this;
        const { chunk: chunk2, textHandler: handler } = this;
        let nonSpace = false;
        outRootLoop:
          while (true) {
            const code = this.getCode();
            switch (code) {
              case LESS: {
                this.state = S_OPEN_WAKA;
                if (handler !== void 0) {
                  const { text: text2 } = this;
                  const slice = chunk2.slice(start, this.prevI);
                  if (text2.length !== 0) {
                    handler(text2 + slice);
                    this.text = "";
                  } else if (slice.length !== 0) {
                    handler(slice);
                  }
                }
                break outRootLoop;
              }
              case AMP:
                this.state = S_ENTITY;
                this.entityReturnState = S_TEXT;
                if (handler !== void 0) {
                  this.text += chunk2.slice(start, this.prevI);
                }
                nonSpace = true;
                break outRootLoop;
              case NL_LIKE:
                if (handler !== void 0) {
                  this.text += `${chunk2.slice(start, this.prevI)}
`;
                }
                start = this.i;
                break;
              case EOC:
                if (handler !== void 0) {
                  this.text += chunk2.slice(start);
                }
                break outRootLoop;
              default:
                if (!isS(code)) {
                  nonSpace = true;
                }
            }
          }
        if (!nonSpace) {
          return;
        }
        if (!this.sawRoot && !this.reportedTextBeforeRoot) {
          this.fail("text data outside of root node.");
          this.reportedTextBeforeRoot = true;
        }
        if (this.closedRoot && !this.reportedTextAfterRoot) {
          this.fail("text data outside of root node.");
          this.reportedTextAfterRoot = true;
        }
      }
      pushAttribNS(name2, value) {
        var _a;
        const { prefix: prefix2, local } = this.qname(name2);
        const attr = { name: name2, prefix: prefix2, local, value };
        this.attribList.push(attr);
        (_a = this.attributeHandler) === null || _a === void 0 ? void 0 : _a.call(this, attr);
        if (prefix2 === "xmlns") {
          const trimmed = value.trim();
          if (this.currentXMLVersion === "1.0" && trimmed === "") {
            this.fail("invalid attempt to undefine prefix in XML 1.0");
          }
          this.topNS[local] = trimmed;
          nsPairCheck(this, local, trimmed);
        } else if (name2 === "xmlns") {
          const trimmed = value.trim();
          this.topNS[""] = trimmed;
          nsPairCheck(this, "", trimmed);
        }
      }
      pushAttribPlain(name2, value) {
        var _a;
        const attr = { name: name2, value };
        this.attribList.push(attr);
        (_a = this.attributeHandler) === null || _a === void 0 ? void 0 : _a.call(this, attr);
      }
      /**
       * End parsing. This performs final well-formedness checks and resets the
       * parser to a clean state.
       *
       * @returns this
       */
      end() {
        var _a, _b;
        if (!this.sawRoot) {
          this.fail("document must contain a root element.");
        }
        const { tags } = this;
        while (tags.length > 0) {
          const tag = tags.pop();
          this.fail(`unclosed tag: ${tag.name}`);
        }
        if (this.state !== S_BEGIN && this.state !== S_TEXT) {
          this.fail("unexpected end.");
        }
        const { text: text2 } = this;
        if (text2.length !== 0) {
          (_a = this.textHandler) === null || _a === void 0 ? void 0 : _a.call(this, text2);
          this.text = "";
        }
        this._closed = true;
        (_b = this.endHandler) === null || _b === void 0 ? void 0 : _b.call(this);
        this._init();
        return this;
      }
      /**
       * Resolve a namespace prefix.
       *
       * @param prefix The prefix to resolve.
       *
       * @returns The namespace URI or ``undefined`` if the prefix is not defined.
       */
      resolve(prefix2) {
        var _a, _b;
        let uri = this.topNS[prefix2];
        if (uri !== void 0) {
          return uri;
        }
        const { tags } = this;
        for (let index = tags.length - 1; index >= 0; index--) {
          uri = tags[index].ns[prefix2];
          if (uri !== void 0) {
            return uri;
          }
        }
        uri = this.ns[prefix2];
        if (uri !== void 0) {
          return uri;
        }
        return (_b = (_a = this.opt).resolvePrefix) === null || _b === void 0 ? void 0 : _b.call(_a, prefix2);
      }
      /**
       * Parse a qname into its prefix and local name parts.
       *
       * @param name The name to parse
       *
       * @returns
       */
      qname(name2) {
        const colon = name2.indexOf(":");
        if (colon === -1) {
          return { prefix: "", local: name2 };
        }
        const local = name2.slice(colon + 1);
        const prefix2 = name2.slice(0, colon);
        if (prefix2 === "" || local === "" || local.includes(":")) {
          this.fail(`malformed name: ${name2}.`);
        }
        return { prefix: prefix2, local };
      }
      processAttribsNS() {
        var _a;
        const { attribList } = this;
        const tag = this.tag;
        {
          const { prefix: prefix2, local } = this.qname(tag.name);
          tag.prefix = prefix2;
          tag.local = local;
          const uri = tag.uri = (_a = this.resolve(prefix2)) !== null && _a !== void 0 ? _a : "";
          if (prefix2 !== "") {
            if (prefix2 === "xmlns") {
              this.fail('tags may not have "xmlns" as prefix.');
            }
            if (uri === "") {
              this.fail(`unbound namespace prefix: ${JSON.stringify(prefix2)}.`);
              tag.uri = prefix2;
            }
          }
        }
        if (attribList.length === 0) {
          return;
        }
        const { attributes } = tag;
        const seen = /* @__PURE__ */ new Set();
        for (const attr of attribList) {
          const { name: name2, prefix: prefix2, local } = attr;
          let uri;
          let eqname;
          if (prefix2 === "") {
            uri = name2 === "xmlns" ? XMLNS_NAMESPACE : "";
            eqname = name2;
          } else {
            uri = this.resolve(prefix2);
            if (uri === void 0) {
              this.fail(`unbound namespace prefix: ${JSON.stringify(prefix2)}.`);
              uri = prefix2;
            }
            eqname = `{${uri}}${local}`;
          }
          if (seen.has(eqname)) {
            this.fail(`duplicate attribute: ${eqname}.`);
          }
          seen.add(eqname);
          attr.uri = uri;
          attributes[name2] = attr;
        }
        this.attribList = [];
      }
      processAttribsPlain() {
        const { attribList } = this;
        const attributes = this.tag.attributes;
        for (const { name: name2, value } of attribList) {
          if (attributes[name2] !== void 0) {
            this.fail(`duplicate attribute: ${name2}.`);
          }
          attributes[name2] = value;
        }
        this.attribList = [];
      }
      /**
       * Handle a complete open tag. This parser code calls this once it has seen
       * the whole tag. This method checks for well-formeness and then emits
       * ``onopentag``.
       */
      openTag() {
        var _a;
        this.processAttribs();
        const { tags } = this;
        const tag = this.tag;
        tag.isSelfClosing = false;
        (_a = this.openTagHandler) === null || _a === void 0 ? void 0 : _a.call(this, tag);
        tags.push(tag);
        this.state = S_TEXT;
        this.name = "";
      }
      /**
       * Handle a complete self-closing tag. This parser code calls this once it has
       * seen the whole tag. This method checks for well-formeness and then emits
       * ``onopentag`` and ``onclosetag``.
       */
      openSelfClosingTag() {
        var _a, _b, _c;
        this.processAttribs();
        const { tags } = this;
        const tag = this.tag;
        tag.isSelfClosing = true;
        (_a = this.openTagHandler) === null || _a === void 0 ? void 0 : _a.call(this, tag);
        (_b = this.closeTagHandler) === null || _b === void 0 ? void 0 : _b.call(this, tag);
        const top = this.tag = (_c = tags[tags.length - 1]) !== null && _c !== void 0 ? _c : null;
        if (top === null) {
          this.closedRoot = true;
        }
        this.state = S_TEXT;
        this.name = "";
      }
      /**
       * Handle a complete close tag. This parser code calls this once it has seen
       * the whole tag. This method checks for well-formeness and then emits
       * ``onclosetag``.
       */
      closeTag() {
        const { tags, name: name2 } = this;
        this.state = S_TEXT;
        this.name = "";
        if (name2 === "") {
          this.fail("weird empty close tag.");
          this.text += "</>";
          return;
        }
        const handler = this.closeTagHandler;
        let l = tags.length;
        while (l-- > 0) {
          const tag = this.tag = tags.pop();
          this.topNS = tag.ns;
          handler === null || handler === void 0 ? void 0 : handler(tag);
          if (tag.name === name2) {
            break;
          }
          this.fail("unexpected close tag.");
        }
        if (l === 0) {
          this.closedRoot = true;
        } else if (l < 0) {
          this.fail(`unmatched closing tag: ${name2}.`);
          this.text += `</${name2}>`;
        }
      }
      /**
       * Resolves an entity. Makes any necessary well-formedness checks.
       *
       * @param entity The entity to resolve.
       *
       * @returns The parsed entity.
       */
      parseEntity(entity) {
        if (entity[0] !== "#") {
          const defined = this.ENTITIES[entity];
          if (defined !== void 0) {
            return defined;
          }
          this.fail(this.isName(entity) ? "undefined entity." : "disallowed character in entity name.");
          return `&${entity};`;
        }
        let num = NaN;
        if (entity[1] === "x" && /^#x[0-9a-f]+$/i.test(entity)) {
          num = parseInt(entity.slice(2), 16);
        } else if (/^#[0-9]+$/.test(entity)) {
          num = parseInt(entity.slice(1), 10);
        }
        if (!this.isChar(num)) {
          this.fail("malformed character entity.");
          return `&${entity};`;
        }
        return String.fromCodePoint(num);
      }
    };
    exports.SaxesParser = SaxesParser2;
  }
});

// src/host/index.ts
import { randomUUID as randomUUID25 } from "node:crypto";

// src/host/status.ts
var EXPECTED_UPSTREAM_COMMIT = "39163dd30f703a79079e2d2446545cff3c453738";
function verifyUpstreamCommit(commit, expected = EXPECTED_UPSTREAM_COMMIT) {
  if (commit === void 0 || commit.length === 0) return null;
  return commit === expected;
}
function buildStatusPayload(observation) {
  const commit = observation.release?.commit;
  const version = observation.release?.version;
  return {
    schema_version: 1,
    product: "KnowledgeOS",
    upstream_commit: commit === void 0 || commit.length === 0 ? "unknown" : commit,
    upstream_version: version === void 0 || version.length === 0 ? "unknown" : version,
    expected_upstream_commit: EXPECTED_UPSTREAM_COMMIT,
    upstream_commit_verified: verifyUpstreamCommit(commit),
    host_instance_id: observation.instanceId,
    started_at: observation.startedAt,
    checked_at: observation.checkedAt,
    status: "ok"
  };
}

// src/host/config.ts
import { isAbsolute } from "node:path";
import Schema from "@deepseek-ai/schemastery";
var Config = Schema.object({
  dataDir: Schema.string(),
  ai: Schema.object({ provider: Schema.string(), model: Schema.string(), maxCalls: Schema.number().min(1), timeoutMs: Schema.number().min(20).max(6e4), budgetUsd: Schema.number().min(0), inputUsdPerMillion: Schema.number().min(0), outputUsdPerMillion: Schema.number().min(0) })
});
function resolveDataDir(config) {
  if (config.dataDir === void 0) return void 0;
  if (config.dataDir.length === 0) throw new Error("knowledgeos-panel: config.dataDir must not be empty");
  if (!isAbsolute(config.dataDir)) {
    throw new Error("knowledgeos-panel: config.dataDir must be an absolute local path");
  }
  return config.dataDir;
}

// src/host/http.ts
import { randomUUID } from "node:crypto";

// src/host/records.ts
import { createHash } from "node:crypto";
var RecordsError = class extends Error {
  /** Machine-readable code exposed in the API error body. */
  code;
  /** Whether a client may retry the same request. */
  retryable;
  constructor(code, message, retryable = false, options) {
    super(message, options);
    this.name = "RecordsError";
    this.code = code;
    this.retryable = retryable;
  }
};
function contentDigest(content) {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
function createProbeRecord(port, deps, input) {
  return port.createOrReplay({
    id: deps.newId(),
    idempotencyKey: input.idempotencyKey,
    digest: contentDigest(input.content),
    content: input.content,
    createdAt: deps.now()
  });
}
function getProbeRecord(port, id4) {
  return port.getById(id4);
}

// src/host/http.ts
var MAX_REQUEST_BODY_BYTES = 16 * 1024;
var MAX_CONTENT_BYTES = 4096;
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var ApiError = class extends Error {
  status;
  code;
  retryable;
  safeDetails;
  constructor(status, code, message, retryable = false, safeDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.safeDetails = safeDetails;
  }
};
function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.writableEnded || res.destroyed) return;
  const body2 = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [name2, value] of Object.entries(extraHeaders)) res.setHeader(name2, value);
  res.end(body2);
}
function sendApiError(res, requestId, error) {
  sendJson(res, error.status, {
    code: error.code,
    message: error.message,
    request_id: requestId,
    retryable: error.retryable,
    safe_details: error.safeDetails
  }, error.code === "METHOD_NOT_ALLOWED" ? { allow: String(error.safeDetails.allow ?? "") } : {});
}
function recordsErrorToApi(error) {
  switch (error.code) {
    case "STORAGE_BUSY":
      return new ApiError(503, "STORAGE_BUSY", "storage is busy; retry the same request", true);
    case "STORAGE_INCOMPATIBLE":
      return new ApiError(503, "STORAGE_INCOMPATIBLE", "storage is incompatible with this build");
    case "STORAGE_CLOSED":
    case "STORAGE_UNAVAILABLE":
      return new ApiError(503, "STORAGE_UNAVAILABLE", "storage is unavailable");
    default:
      return new ApiError(500, "INTERNAL_ERROR", "internal error");
  }
}
async function readBody(req, limit4) {
  return await new Promise((resolve2, reject2) => {
    let settled = false;
    let total = 0;
    const chunks = [];
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.resume();
      reject2(error);
    };
    req.on("data", (chunk2) => {
      if (settled) return;
      total += chunk2.length;
      if (total > limit4) {
        fail(new ApiError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
        return;
      }
      chunks.push(chunk2);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve2(Buffer.concat(chunks));
    });
    req.on("error", () => {
      fail(new ApiError(400, "INVALID_JSON", "request body could not be read"));
    });
    req.on("aborted", () => {
      if (settled) return;
      settled = true;
      reject2(new ApiError(400, "INVALID_JSON", "request was aborted"));
    });
  });
}
function requireJsonMediaType(req) {
  const raw = req.headers["content-type"];
  if (typeof raw !== "string") throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  const parts = raw.split(";").map((part) => part.trim().toLowerCase());
  if (parts[0] !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  const charset = parts.slice(1).find((part) => part.startsWith("charset="));
  if (charset !== void 0 && charset !== "charset=utf-8") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type charset must be utf-8");
  }
}
function requireIdempotencyKey(req) {
  const raw = req.headers["idempotency-key"];
  if (typeof raw !== "string" || !UUID_PATTERN.test(raw)) {
    throw new ApiError(422, "INPUT_INVALID", "Idempotency-Key must be a canonical lowercase UUID");
  }
  return raw;
}
function parseContent(body2) {
  let text2;
  try {
    text2 = new TextDecoder("utf-8", { fatal: true }).decode(body2);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "request body is not valid UTF-8");
  }
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "request body is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(422, "INPUT_INVALID", "body must be a JSON object");
  }
  const keys4 = Object.keys(parsed);
  if (keys4.length !== 1 || keys4[0] !== "content") {
    throw new ApiError(422, "INPUT_INVALID", "body may contain only the content field");
  }
  const content = parsed.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new ApiError(422, "INPUT_INVALID", "content must be a non-empty string");
  }
  if (!content.isWellFormed()) {
    throw new ApiError(422, "INPUT_INVALID", "content must not contain lone Unicode surrogates");
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes < 1 || bytes > MAX_CONTENT_BYTES) {
    throw new ApiError(422, "INPUT_INVALID", `content must be 1-${MAX_CONTENT_BYTES} UTF-8 bytes`);
  }
  return content;
}
function requestPath(req) {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}
function createRecordsHandlers(service, basePath2, log) {
  const create = async (req, res) => {
    const requestId = randomUUID();
    try {
      if (req.method !== "POST") {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "method not allowed", false, { allow: "POST" });
      }
      requireJsonMediaType(req);
      const key = requireIdempotencyKey(req);
      const body2 = await readBody(req, MAX_REQUEST_BODY_BYTES);
      const content = parseContent(body2);
      const result = service.create(key, content);
      if (result.kind === "conflict") {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "idempotency key was used with different content");
      }
      sendJson(res, result.kind === "created" ? 201 : 200, {
        data: result.record,
        meta: { request_id: requestId, schema_version: 1 }
      });
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof ApiError) {
        sendApiError(res, requestId, error);
        return;
      }
      if (error instanceof RecordsError) {
        sendApiError(res, requestId, recordsErrorToApi(error));
        return;
      }
      log(`knowledgeos-storage: request failed request_id=${requestId}`);
      sendApiError(res, requestId, new ApiError(500, "INTERNAL_ERROR", "internal error"));
    }
  };
  const read = async (req, res) => {
    const requestId = randomUUID();
    try {
      if (req.method !== "GET") {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "method not allowed", false, { allow: "GET" });
      }
      const path2 = requestPath(req);
      const prefix2 = `${basePath2}/`;
      if (!path2.startsWith(prefix2) || path2.slice(prefix2.length).includes("/")) {
        throw new ApiError(404, "NOT_FOUND", "record not found");
      }
      const id4 = path2.slice(prefix2.length);
      if (!UUID_PATTERN.test(id4)) {
        throw new ApiError(422, "INPUT_INVALID", "record id must be a canonical lowercase UUID");
      }
      const record = service.get(id4);
      if (record === void 0) throw new ApiError(404, "NOT_FOUND", "record not found");
      sendJson(res, 200, {
        data: record,
        meta: { request_id: requestId, schema_version: 1 }
      });
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof ApiError) {
        sendApiError(res, requestId, error);
        return;
      }
      if (error instanceof RecordsError) {
        sendApiError(res, requestId, recordsErrorToApi(error));
        return;
      }
      log(`knowledgeos-storage: request failed request_id=${requestId}`);
      sendApiError(res, requestId, new ApiError(500, "INTERNAL_ERROR", "internal error"));
    }
  };
  return { create, read };
}

// src/host/storage.ts
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash as createHash13, randomUUID as randomUUID15 } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// src/host/jobs.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var JOB_SCHEMA = `CREATE TABLE jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES auth_sessions(id),
  object_id TEXT NOT NULL REFERENCES knowledge_objects(id), expected_revision INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0,
  checkpoint INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint IN (0,1)), lease_token TEXT UNIQUE, lease_until INTEGER,
  available_at INTEGER NOT NULL, last_error TEXT, UNIQUE(user_id,idempotency_key),
  CHECK((state='running')=(lease_token IS NOT NULL)), CHECK((state='running')=(lease_until IS NOT NULL))
) STRICT;
CREATE INDEX jobs_ready ON jobs(state,available_at);
CREATE TABLE job_runs (job_id TEXT NOT NULL REFERENCES jobs(id), attempt INTEGER NOT NULL, worker TEXT NOT NULL,
  started_at INTEGER NOT NULL, start_checkpoint INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, PRIMARY KEY(job_id,attempt)) STRICT;
CREATE TABLE job_results (job_id TEXT PRIMARY KEY REFERENCES jobs(id), input_revision INTEGER NOT NULL) STRICT;
CREATE TABLE outbox (event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES job_results(job_id), created_at INTEGER NOT NULL,
  delivered_at INTEGER, failures INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, last_error TEXT) STRICT;
CREATE TABLE event_receipts (consumer_name TEXT NOT NULL, event_id TEXT NOT NULL REFERENCES outbox(event_id), PRIMARY KEY(consumer_name,event_id)) STRICT;
`;
var JobError = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};
var JobStore = class {
  constructor(tx, revision, fault) {
    this.tx = tx;
    this.revision = revision;
    this.fault = fault;
  }
  enqueue(actor2, object2, revision, key) {
    return this.tx((db, now) => {
      const current = this.revision(actor2.sessionId, actor2.userId, object2, now);
      if (current === void 0) throw new JobError(404, "NOT_FOUND");
      const prior = db.prepare("SELECT id,object_id,expected_revision FROM jobs WHERE user_id=? AND idempotency_key=?").get(actor2.userId, key);
      if (prior) {
        if (prior.object_id !== object2 || prior.expected_revision !== revision) throw new JobError(409, "IDEMPOTENCY_CONFLICT");
        return String(prior.id);
      }
      if (current !== revision) throw new JobError(409, "REVISION_CONFLICT");
      const id4 = randomUUID2();
      db.prepare("INSERT INTO jobs(id,user_id,session_id,object_id,expected_revision,idempotency_key,state,available_at) VALUES(?,?,?,?,?,?,'queued',?)").run(id4, actor2.userId, actor2.sessionId, object2, revision, key, now);
      return id4;
    });
  }
  inspect(actor2, id4, cancel = false) {
    return this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(id4, actor2.userId);
      if (!row || this.revision(actor2.sessionId, actor2.userId, row.object_id, now) === void 0) throw new JobError(404, "NOT_FOUND");
      if (cancel && ["succeeded", "failed"].includes(row.state)) throw new JobError(409, "JOB_TERMINAL");
      if (cancel && row.state !== "cancelled") this.end(db, row, "cancelled", "CANCELLED", now);
      const summary = db.prepare("SELECT id,state,attempts,checkpoint,last_error,expected_revision FROM jobs WHERE id=?").get(id4);
      const runs = db.prepare("SELECT attempt,start_checkpoint,started_at,ended_at,outcome FROM job_runs WHERE job_id=? ORDER BY attempt").all(id4);
      const delivery = db.prepare("SELECT delivered_at,failures,retry_at,last_error FROM outbox WHERE job_id=?").get(id4);
      return { ...summary, runs, delivery: delivery ?? null };
    });
  }
  end(db, row, state, reason, now) {
    db.prepare("UPDATE job_runs SET ended_at=?,outcome=? WHERE job_id=? AND attempt=? AND ended_at IS NULL").run(now, reason ?? state, row.id, row.attempts);
    db.prepare("UPDATE jobs SET state=?,lease_token=NULL,lease_until=NULL,last_error=?,available_at=? WHERE id=?").run(state, reason, now + (state === "queued" ? 250 : 0), row.id);
  }
  claim(worker) {
    return this.tx((db, now) => {
      const lost = db.prepare("SELECT * FROM jobs WHERE state='running' AND lease_until<=? ORDER BY lease_until LIMIT 1").get(now);
      if (lost) this.end(db, lost, lost.attempts >= 3 ? "failed" : "queued", "LEASE_EXPIRED", now);
      const row = db.prepare("SELECT * FROM jobs WHERE state='queued' AND available_at<=? ORDER BY available_at,id LIMIT 1").get(now);
      if (!row) return void 0;
      const token2 = randomUUID2();
      db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?").run(token2, now + 3e3, row.id);
      db.prepare("INSERT INTO job_runs(job_id,attempt,worker,started_at,start_checkpoint) VALUES(?,?,?,?,?)").run(row.id, row.attempts + 1, worker, now, row.checkpoint);
      return { id: row.id, token: token2, checkpoint: row.checkpoint };
    });
  }
  renew(token2) {
    return this.tx((db, now) => db.prepare("UPDATE jobs SET lease_until=? WHERE state='running' AND lease_token=? AND lease_until>?").run(now + 3e3, token2, now).changes === 1);
  }
  step(token2) {
    return this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE state='running' AND lease_token=? AND lease_until>?").get(token2, now);
      if (!row) return "lost";
      const revision = this.revision(row.session_id, row.user_id, row.object_id, now);
      if (revision !== row.expected_revision) {
        this.end(db, row, "failed", revision === void 0 ? "AUTH_REVOKED" : "REVISION_CONFLICT", now);
        return "failed";
      }
      if (row.checkpoint === 0) {
        db.prepare("UPDATE jobs SET checkpoint=1 WHERE id=?").run(row.id);
        return "checkpoint";
      }
      db.prepare("INSERT INTO job_results(job_id,input_revision) VALUES(?,?)").run(row.id, revision);
      this.fault("job:after-result");
      db.prepare("INSERT INTO outbox(event_id,job_id,created_at) VALUES(?,?,?)").run(randomUUID2(), row.id, now);
      this.fault("job:after-outbox");
      this.end(db, row, "succeeded", null, now);
      return "succeeded";
    });
  }
  retry(token2) {
    this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE lease_token=? AND lease_until>?").get(token2, now);
      if (row) this.end(db, row, row.attempts >= 3 ? "failed" : "queued", "WORKER_ERROR", now);
    });
  }
  receive(db, event, now) {
    const entry = db.prepare("SELECT delivered_at,failures,retry_at FROM outbox WHERE event_id=?").get(event);
    if (!entry || Number(entry.failures) >= 3 || Number(entry.retry_at) > now) return false;
    db.exec("SAVEPOINT consume_event");
    try {
      const inserted = db.prepare("INSERT INTO event_receipts(consumer_name,event_id) VALUES('probe',?) ON CONFLICT DO NOTHING").run(event);
      if (inserted.changes === 1) this.fault("event:after-receipt");
      db.prepare("UPDATE outbox SET delivered_at=COALESCE(delivered_at,?),last_error=NULL WHERE event_id=?").run(now, event);
      db.exec("RELEASE consume_event");
      return inserted.changes === 1;
    } catch {
      db.exec("ROLLBACK TO consume_event; RELEASE consume_event");
      db.prepare("UPDATE outbox SET failures=failures+1,retry_at=?,last_error='CONSUMER_FAILED' WHERE event_id=?").run(now + 250 * (1 + Number(entry.failures)), event);
      return false;
    }
  }
  consume(event) {
    return this.tx((db, now) => this.receive(db, event, now));
  }
  dispatch() {
    return this.tx((db, now) => {
      const event = db.prepare("SELECT event_id FROM outbox WHERE delivered_at IS NULL AND failures<3 AND retry_at<=? ORDER BY created_at LIMIT 1").get(now);
      return event ? this.receive(db, String(event.event_id), now) : false;
    });
  }
};
function startWorker(store, log) {
  const worker = randomUUID2();
  let token2;
  const timer = setInterval(() => {
    try {
      store.dispatch();
      if (!token2) token2 = store.claim(worker)?.token;
      else if (!store.renew(token2) || store.step(token2) !== "checkpoint") token2 = void 0;
    } catch {
      log("knowledgeos-jobs: worker transaction failed");
      if (token2) {
        try {
          store.retry(token2);
        } catch {
        }
        token2 = void 0;
      }
    }
  }, 500);
  timer.unref();
  return () => clearInterval(timer);
}

// src/host/authorization.ts
var AUTH_ACTIONS = ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"];
function isGrantActive(grant, now) {
  return grant.revokedAt === void 0 && grant.validFrom <= now && (grant.expiresAt === void 0 || now < grant.expiresAt);
}
function horizon(rows, now) {
  let latest;
  for (const row of rows) {
    if (!isGrantActive(row, now)) continue;
    if (row.expiresAt === void 0) return null;
    if (latest === void 0 || row.expiresAt > latest) latest = row.expiresAt;
  }
  return latest;
}
function authorizationHorizon(actor2, target3, action2, now, grants = [], memberships = [], documentInvitations = []) {
  if (target3.status !== "active" || target3.serviceId !== actor2.serviceId) return;
  const invited = action2 === "read" || action2 === "edit" ? documentInvitations.filter((item) => item.subjectType === "user" && item.subjectId === actor2.userId && item.action === action2) : [];
  if (target3.scope === "personal") return target3.spaceId === actor2.personalSpaceId && target3.ownerUserId === actor2.userId ? null : horizon(invited, now);
  if (target3.projectId === void 0) return;
  const member = horizon(memberships.filter((item) => item.projectId === target3.projectId && item.userId === actor2.userId), now);
  if (member === void 0) return;
  const grant = horizon([...invited, ...grants.filter((item) => item.action === action2 && (item.subjectType === "user" && item.subjectId === actor2.userId || item.subjectType === "project" && item.subjectId === target3.projectId))], now);
  if (grant === void 0) return;
  if (member === null) return grant;
  if (grant === null) return member;
  return grant < member ? grant : member;
}
function authorize(...args2) {
  return authorizationHorizon(...args2) !== void 0;
}

// src/host/asset-store.ts
import { createHash as createHash2, randomUUID as randomUUID3 } from "node:crypto";
var ASSET_SCHEMA = `CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type='application/pdf')
) STRICT;
CREATE TABLE assets (id TEXT PRIMARY KEY REFERENCES knowledge_objects(id)) STRICT;
CREATE TABLE asset_versions (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), version INTEGER NOT NULL CHECK(version>0),
  parent_version_id TEXT REFERENCES asset_versions(id), blob_id TEXT NOT NULL UNIQUE REFERENCES blobs(id),
  original_name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, UNIQUE(asset_id,version), UNIQUE(created_by,idempotency_key)
) STRICT;`;
var AssetError = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};
var receiptSQL = `SELECT v.asset_id AS id,v.original_name AS title,v.id AS version_id,v.version,b.sha256,b.byte_length,b.media_type FROM asset_versions v JOIN blobs b ON b.id=v.blob_id `;
function receipt(row) {
  const { media_type, ...rest } = row;
  return media_type === "application/pdf" ? rest : { ...rest, media_type };
}
var AssetStore = class {
  constructor(tx, current, allowed) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
  }
  actor(prior, now) {
    const actor2 = this.current(prior, now);
    if (!actor2) throw new AssetError(401, "AUTH_REQUIRED");
    return actor2;
  }
  check(actor2, id4, action2, now) {
    if (!this.allowed(actor2, id4, action2, now)) throw new AssetError(404, "ASSET_NOT_FOUND");
  }
  publish(prior, spec2, blob, format, onPublish) {
    const text2 = format && "blocks" in format ? format : void 0;
    return this.tx("write", (db, now) => {
      const actor2 = this.actor(prior, now), digest4 = createHash2("sha256").update(JSON.stringify([spec2.title, spec2.assetId ?? null, spec2.expectedVersion ?? null, blob.sha256, blob.byteLength, ...text2 ? [text2.media, text2.encoding] : format ? [format.media] : []])).digest("hex");
      const prev = db.prepare("SELECT id,asset_id,request_digest FROM asset_versions WHERE created_by=? AND idempotency_key=?").get(actor2.userId, spec2.key);
      if (prev) {
        this.check(actor2, String(prev.asset_id), "read", now);
        this.check(actor2, String(prev.asset_id), "edit", now);
        if (prev.request_digest !== digest4) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        const r = receipt(db.prepare(receiptSQL + "WHERE v.id=?").get(prev.id));
        onPublish?.(db, actor2, r);
        return { receipt: r, replayed: true };
      }
      const id4 = spec2.assetId ?? randomUUID3(), vid = randomUUID3(), bid = randomUUID3();
      let version = 1, parent = null;
      if (spec2.assetId) {
        this.check(actor2, id4, "read", now);
        this.check(actor2, id4, "edit", now);
        const last = db.prepare("SELECT id,version FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1").get(id4);
        if (!last) throw new AssetError(404, "ASSET_NOT_FOUND");
        if (last.version !== spec2.expectedVersion) throw new AssetError(409, "VERSION_CONFLICT");
        version = Number(last.version) + 1;
        parent = String(last.id);
        db.prepare("UPDATE knowledge_objects SET revision=revision+1,updated_at=? WHERE id=?").run(now, id4);
        db.prepare("UPDATE office_conversions SET state='superseded',lease_token=NULL,lease_until=NULL,failure_code='SOURCE_CHANGED',updated_at=? WHERE version_id=? AND state IN ('queued','running')").run(now, parent);
      } else {
        db.prepare(`INSERT INTO knowledge_objects (id,service_id,space_id,scope_kind,project_id,owner_user_id,object_type,title,body,status,revision,created_at,updated_at) VALUES (?,?,?,'personal',NULL,?,'asset',?,'','active',1,?,?)`).run(id4, actor2.serviceId, actor2.personalSpaceId, actor2.userId, spec2.title, now, now);
        db.prepare("INSERT INTO assets VALUES (?)").run(id4);
      }
      db.prepare("INSERT INTO blobs VALUES (?,?,?,?,?)").run(bid, blob.key, blob.sha256, blob.byteLength, format?.media ?? "application/pdf");
      db.prepare("INSERT INTO asset_versions VALUES (?,?,?,?,?,?,?,?,?,?)").run(vid, id4, version, parent, bid, spec2.title, actor2.userId, now, spec2.key, digest4);
      if (text2) {
        db.prepare("INSERT INTO text_versions VALUES(?,?,?)").run(vid, text2.encoding, text2.blocks.length);
        const insert = db.prepare("INSERT INTO text_blocks VALUES(?,?,?,?,?,?,?)");
        text2.blocks.forEach((b, i) => insert.run(vid, i + 1, b.kind, b.start, b.end, b.text, b.anchor));
      }
      const published = { id: id4, title: spec2.title, version_id: vid, version, sha256: blob.sha256, byte_length: blob.byteLength, ...format ? { media_type: format.media } : {} };
      onPublish?.(db, actor2, published);
      return { receipt: published, replayed: false };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const actor2 = this.actor(prior, now);
      return db.prepare(receiptSQL + `JOIN knowledge_objects o ON o.id=v.asset_id
      WHERE o.service_id=? AND o.status='active' AND (o.owner_user_id=? OR EXISTS(
        SELECT 1 FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id
        WHERE i.object_id=o.id AND i.service_id=o.service_id AND r.user_id=? AND i.revoked_at IS NULL
          AND r.revoked_at IS NULL AND r.expires_at=i.expires_at AND r.expires_at>?))
      ORDER BY v.created_at DESC,v.version DESC,v.id`).all(actor2.serviceId, actor2.userId, actor2.userId, now).filter((v) => this.allowed(actor2, String(v.id), "read", now)).map(receipt);
    });
  }
  original(prior, id4, versionId, download) {
    return this.tx("read", (db, now) => {
      const actor2 = this.actor(prior, now);
      this.check(actor2, id4, "read", now);
      if (download) this.check(actor2, id4, "export", now);
      const r = db.prepare("SELECT b.storage_key,b.sha256,b.byte_length,b.media_type,t.encoding FROM asset_versions v JOIN blobs b ON b.id=v.blob_id LEFT JOIN text_versions t ON t.version_id=v.id WHERE v.asset_id=? AND v.id=?").get(id4, versionId);
      if (!r) throw new AssetError(404, "ASSET_NOT_FOUND");
      return { key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length), ...r.media_type === "application/pdf" ? {} : { media: String(r.media_type) }, ...typeof r.encoding === "string" ? { encoding: r.encoding } : {} };
    });
  }
  blocks(prior, id4, v, from, limit4) {
    return this.tx("read", (db, now) => {
      const actor2 = this.actor(prior, now);
      this.check(actor2, id4, "read", now);
      if (!Number.isSafeInteger(from) || from < 1 || !Number.isSafeInteger(limit4) || limit4 < 1 || limit4 > 10) throw new AssetError(422, "INVALID_BLOCK_RANGE");
      const meta = db.prepare("SELECT encoding,block_count AS total FROM text_versions t JOIN asset_versions a ON a.id=t.version_id WHERE a.asset_id=? AND a.id=?").get(id4, v);
      if (!meta) throw new AssetError(404, "ASSET_NOT_FOUND");
      return { version_id: v, ...meta, blocks: db.prepare("SELECT ordinal,kind,start,end,text,anchor FROM text_blocks WHERE version_id=? AND ordinal>=? ORDER BY ordinal LIMIT ?").all(v, from, limit4) };
    });
  }
};

// src/host/search-store.ts
import { createHash as createHash3, randomUUID as randomUUID4 } from "node:crypto";

// src/host/search-lexical.ts
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
var token = /[\p{L}\p{N}\p{M}_]+(?:[.:/+\-]+[\p{L}\p{N}\p{M}_]+)*(?:\+\+|#)?/gu;
var bilingual = [
  ["deadlock", "\u6B7B\u9501"],
  ["mutex", "\u4E92\u65A5\u9501"],
  ["rollback", "\u56DE\u6EDA"],
  ["\u5B58\u53D6\u63A7\u5236\u6E05\u5355", "\u8BBF\u95EE\u63A7\u5236\u5217\u8868"]
];
var aliases = new Map(bilingual.flatMap(([a, b]) => [[a, [a, b]], [b, [b, a]]]));
var normalize = (s) => s.normalize("NFKC").toLowerCase();
function compileSearchQuery(raw) {
  if (raw.length > 256 || Array.from(raw).length > 128) throw new Error("INVALID_SEARCH_QUERY");
  const value = normalize(raw).trim().replace(/\(\)$/, "");
  const terms = [...new Set(value.match(token) ?? [])];
  if (!terms.length || terms.length > 12) throw new Error("INVALID_SEARCH_QUERY");
  return { terms: terms.map((term) => aliases.get(term) ?? [term]), phrase: value, normalized: terms.join(" ") };
}
function indexSearchText(source) {
  const parts = [], ranges = [];
  for (const { segment, index } of segmenter.segment(source)) {
    const value = normalize(segment);
    parts.push(value);
    const range = { start: index, end: index + segment.length };
    for (let i = 0; i < value.length; i++) ranges.push(range);
  }
  return { normalized: parts.join(""), ranges };
}
function matchSearchText(index, query) {
  const range = (at, length, score2) => ({ start: index.ranges[at].start, end: index.ranges[at + length - 1].end, score: score2 });
  const exact = index.normalized.indexOf(query.phrase);
  if (exact !== -1) return range(exact, query.phrase.length, 20 + 2 * query.terms.length);
  let first, score = 0;
  for (const variants of query.terms) {
    let found;
    for (const [i, text2] of variants.entries()) {
      const at = index.normalized.indexOf(text2);
      if (at !== -1) {
        found = range(at, text2.length, i === 0 ? 2 : 1);
        break;
      }
    }
    if (!found) return null;
    first ??= found;
    score += found.score;
  }
  return first ? { start: first.start, end: first.end, score } : null;
}

// src/host/search-store.ts
var SEARCH_SCHEMA = `CREATE TABLE search_queries (
  query_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), scope_filter TEXT NOT NULL,
  normalized_query TEXT NOT NULL, index_version TEXT NOT NULL, result_source_versions TEXT NOT NULL,
  ranking_inputs TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX search_queries_actor ON search_queries(actor_id,created_at);`;
var indexVersion = "lexical-nfkc-v2";
var maxWork = 4 * 1024 * 1024;
var maxSources = 2e4;
var maxResults = 30;
var maxCache = 256e3;
var sha = (text2) => createHash3("sha256").update(text2, "utf8").digest("hex");
var sourceSQL = `SELECT v.asset_id AS asset_id,v.id AS version_id,v.version,v.original_name AS title,
    p.page AS ordinal,p.chapter AS chapter,'pdf' AS kind,p.state AS state,p.text AS text,NULL AS conversion_id
  FROM asset_versions v JOIN pdf_pages p ON v.id=p.version_id WHERE v.asset_id IN (SELECT value FROM json_each(?))
    AND p.state IN ('ready','review') AND length(p.text)>0
  UNION ALL
  SELECT v.asset_id,v.id,v.version,v.original_name,b.ordinal,b.kind,'text','ready',b.text,NULL
  FROM asset_versions v JOIN text_blocks b ON v.id=b.version_id WHERE v.asset_id IN (SELECT value FROM json_each(?)) AND length(b.text)>0
  UNION ALL
  SELECT v.asset_id,v.id,v.version,v.original_name,p.page,'','office','ready',p.text,c.id
  FROM asset_versions v JOIN office_conversions c ON c.version_id=v.id JOIN word_search_runs r
    ON r.conversion_id=c.id AND r.result_blob_id=c.result_blob_id JOIN word_search_pages p ON p.conversion_id=c.id
  WHERE v.asset_id IN (SELECT value FROM json_each(?)) AND c.state='ready' AND p.page<=c.page_count`;
var SearchStore = class {
  constructor(tx, current, allowed) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
  }
  cache = /* @__PURE__ */ new Map();
  weight = 0;
  actor(a, now) {
    const current = this.current(a, now);
    if (!current) throw new AssetError(401, "AUTH_REQUIRED");
    return current;
  }
  indexed(hash4, text2) {
    const hit = this.cache.get(hash4);
    if (hit) {
      this.cache.delete(hash4);
      this.cache.set(hash4, hit);
      return hit.index;
    }
    const index = indexSearchText(text2), weight = index.ranges.length;
    if (weight > maxCache) return index;
    while (this.weight + weight > maxCache) {
      const key = this.cache.keys().next().value;
      this.weight -= this.cache.get(key).weight;
      this.cache.delete(key);
    }
    this.cache.set(hash4, { index, weight });
    this.weight += weight;
    return index;
  }
  search(prior, raw) {
    let query;
    try {
      query = compileSearchQuery(raw);
    } catch {
      throw new AssetError(422, "INVALID_SEARCH_QUERY");
    }
    const candidates = this.tx("read", (db, now) => {
      const a = this.actor(prior, now);
      const ids = db.prepare(`SELECT a.id FROM assets a JOIN knowledge_objects o ON a.id=o.id WHERE o.service_id=? AND o.status='active'`).all(a.serviceId).map((r) => String(r.id)).filter((id4) => this.allowed(a, id4, now));
      const bound = JSON.stringify(ids), results = [];
      let work = 0, sources2 = 0;
      for (const row of db.prepare(sourceSQL).iterate(bound, bound, bound)) {
        const { text: text2, conversion_id, ...source } = row;
        work += text2.length;
        if (work > maxWork || ++sources2 > maxSources) throw new AssetError(503, "SEARCH_WORK_LIMIT");
        const source_hash = sha(text2), match = matchSearchText(this.indexed(source_hash, text2), query);
        if (!match) continue;
        const from = Math.max(0, match.start - 70), to = Math.min(text2.length, match.end + 70);
        const snippet = text2.slice(from, to).replace(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/g, "");
        results.push({ ...source, ...conversion_id ? { conversion_id } : {}, ...match, source_hash, quote: text2.slice(match.start, match.end), snippet });
      }
      return results.sort((a2, b) => b.score - a2.score || a2.title.localeCompare(b.title, "zh-CN") || a2.asset_id.localeCompare(b.asset_id) || b.version - a2.version || a2.ordinal - b.ordinal || (a2.conversion_id ?? "").localeCompare(b.conversion_id ?? ""));
    });
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now), decisions = /* @__PURE__ */ new Map();
      const items = [];
      for (const item of candidates) {
        if (!decisions.has(item.asset_id)) decisions.set(item.asset_id, this.allowed(a, item.asset_id, now));
        if (!decisions.get(item.asset_id) || !this.unchanged(db, item)) continue;
        items.push(item);
        if (items.length === maxResults) break;
      }
      const query_id = randomUUID4(), scope_filter = "readable_parsed_assets";
      db.prepare("INSERT INTO search_queries VALUES(?,?,?,?,?,?,?,?)").run(
        query_id,
        a.userId,
        scope_filter,
        query.normalized,
        indexVersion,
        JSON.stringify([...new Set(items.map((i) => i.version_id))]),
        JSON.stringify(items.map(({ asset_id, version_id, ordinal, source_hash, kind, state, start, end, score, conversion_id }) => ({ asset_id, version_id, ordinal, source_hash, kind, state, start, end, score, conversion_id }))),
        now
      );
      return { query_id, actor_id: a.userId, count: items.length, items };
    });
  }
  revalidate(prior, queryId) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), row = db.prepare("SELECT ranking_inputs FROM search_queries WHERE query_id=? AND actor_id=?").get(queryId, a.userId);
      if (!row) throw new AssetError(404, "SEARCH_UNAVAILABLE");
      const sources2 = JSON.parse(String(row.ranking_inputs));
      if (sources2.some((s) => !this.allowed(a, s.asset_id, now) || !this.unchanged(db, s))) throw new AssetError(404, "SEARCH_UNAVAILABLE");
      return { actor_id: a.userId, query_id: queryId };
    });
  }
  unchanged(db, item) {
    const source = item.kind === "office" ? db.prepare(`SELECT p.text,c.state FROM office_conversions c JOIN asset_versions v ON v.id=c.version_id
      JOIN word_search_runs r ON r.conversion_id=c.id AND r.result_blob_id=c.result_blob_id JOIN word_search_pages p ON p.conversion_id=c.id
      WHERE v.asset_id=? AND v.id=? AND p.page=? AND c.id=? AND p.page<=c.page_count`).get(item.asset_id, item.version_id, item.ordinal, item.conversion_id ?? null) : item.kind === "pdf" ? db.prepare(`SELECT p.text,p.state FROM pdf_pages p JOIN asset_versions v ON v.id=p.version_id
      WHERE v.asset_id=? AND v.id=? AND p.page=?`).get(item.asset_id, item.version_id, item.ordinal) : db.prepare(`SELECT b.text,'ready' AS state FROM text_blocks b JOIN asset_versions v ON v.id=b.version_id
      WHERE v.asset_id=? AND v.id=? AND b.ordinal=?`).get(item.asset_id, item.version_id, item.ordinal);
    return source?.state === item.state && typeof source.text === "string" && sha(source.text) === item.source_hash;
  }
};

// src/host/word-search-index.ts
import { randomUUID as randomUUID5 } from "node:crypto";
var WORD_SEARCH_SCHEMA = `CREATE TABLE word_search_runs (
  conversion_id TEXT PRIMARY KEY REFERENCES office_conversions(id), result_blob_id TEXT NOT NULL REFERENCES blobs(id),
  state TEXT NOT NULL CHECK(state IN ('running','complete','failed')), next_page INTEGER NOT NULL CHECK(next_page>=1),
  attempts INTEGER NOT NULL CHECK(attempts>=0), token TEXT UNIQUE, lease_until TEXT,
  CHECK((state='running' AND token IS NOT NULL AND lease_until IS NOT NULL) OR
    (state!='running' AND token IS NULL AND lease_until IS NULL))
) STRICT;
CREATE TABLE word_search_pages (
  conversion_id TEXT NOT NULL REFERENCES word_search_runs(conversion_id), page INTEGER NOT NULL CHECK(page>=1),
  text TEXT NOT NULL CHECK(length(text)<=32000), PRIMARY KEY(conversion_id,page)
) STRICT;`;
var deadline = (now, ms = 2e4) => new Date(Date.parse(now) + ms).toISOString();
var sources = `FROM office_conversions c JOIN asset_versions v ON v.id=c.version_id
  JOIN knowledge_objects o ON o.id=v.asset_id JOIN blobs b ON b.id=c.result_blob_id`;
var eligible = `c.state='ready' AND o.status='active' AND b.media_type='application/pdf'`;
var due = `SELECT c.id,c.result_blob_id,c.page_count,b.storage_key,b.byte_length,b.sha256,r.next_page,r.attempts
  ${sources} LEFT JOIN word_search_runs r ON r.conversion_id=c.id WHERE ${eligible}
  AND (r.conversion_id IS NULL OR (r.result_blob_id=c.result_blob_id AND r.state='running' AND r.lease_until<=?))
  ORDER BY c.rowid LIMIT 1`;
var WordSearchIndex = class {
  constructor(tx) {
    this.tx = tx;
  }
  claim() {
    if (!this.tx("read", (db, now) => db.prepare(due).get(now))) return;
    return this.tx("write", (db, now) => {
      const r = db.prepare(due).get(now);
      if (!r) return;
      const attempts = Number(r.attempts ?? 0);
      if (attempts >= 3) {
        db.prepare("UPDATE word_search_runs SET state='failed',token=NULL,lease_until=NULL WHERE conversion_id=?").run(r.id);
        return;
      }
      const token2 = randomUUID5();
      db.prepare(`INSERT INTO word_search_runs VALUES(?,?,'running',1,1,?,?) ON CONFLICT(conversion_id) DO UPDATE SET
        attempts=attempts+1,token=excluded.token,lease_until=excluded.lease_until`).run(r.id, r.result_blob_id, token2, deadline(now));
      return {
        token: token2,
        key: String(r.storage_key),
        sha256: String(r.sha256),
        byteLength: Number(r.byte_length),
        total: Number(r.page_count),
        next: Number(r.next_page ?? 1)
      };
    });
  }
  publish(token2, page, text2, quality) {
    return this.tx("write", (db, now) => {
      const r = db.prepare(`SELECT c.id,c.page_count,c.result_blob_id ${sources} JOIN word_search_runs r ON r.conversion_id=c.id
      WHERE ${eligible} AND r.state='running' AND r.result_blob_id=c.result_blob_id AND r.token=? AND r.lease_until>? AND r.next_page=?`).get(token2, now, page);
      if (!r || !Number.isSafeInteger(page) || page < 1 || page > Number(r.page_count) || text2 !== null && text2.length > 32e3) return false;
      if (text2) db.prepare("INSERT INTO word_search_pages VALUES(?,?,?)").run(r.id, page, text2);
      if (quality === "text" && text2 || quality === "blank" && text2 === "") {
        db.prepare("INSERT INTO recall_word_sources VALUES(?,?,?,?)").run(r.id, page, r.result_blob_id, Number(quality === "blank"));
      }
      if (page === Number(r.page_count)) db.prepare("UPDATE word_search_runs SET state='complete',next_page=?,attempts=0,token=NULL,lease_until=NULL WHERE token=?").run(page + 1, token2);
      else db.prepare("UPDATE word_search_runs SET next_page=?,attempts=0,lease_until=? WHERE token=?").run(page + 1, deadline(now), token2);
      return true;
    });
  }
  defer(token2, refund = false) {
    this.tx("write", (db, now) => {
      db.prepare(`UPDATE word_search_runs SET lease_until=?,attempts=max(0,attempts-?) WHERE token=?`).run(deadline(now, 1e3), refund ? 1 : 0, token2);
    });
  }
};
var errorCode = (e) => e?.code;
function startWordSearchIndex(store, originals, open3, log) {
  const lifecycle = new AbortController();
  let pending;
  async function tick() {
    const job = store.claim();
    if (!job) return;
    const signal = lifecycle.signal;
    let doc;
    try {
      const bytes = await originals.read(job.key, job.sha256, job.byteLength);
      signal.throwIfAborted();
      doc = await open3(bytes, signal);
      if (doc.numPages !== job.total) throw Error("Conversion page count changed");
      for (let i = job.next; i <= doc.numPages; i++) {
        signal.throwIfAborted();
        let text2, quality;
        try {
          const page = await doc.page(i);
          text2 = page.text;
          quality = page.confirmedBlank ? "blank" : page.needsReview ? void 0 : "text";
        } catch (e) {
          if (errorCode(e) !== "PDF_PAGE_FAILED") throw e;
          text2 = null;
        }
        if (signal.aborted || !store.publish(job.token, i, text2, quality)) return;
      }
    } catch (e) {
      if (!signal.aborted) store.defer(job.token, errorCode(e) === "PDF_BUSY");
    } finally {
      await doc?.close();
    }
  }
  const timer = setInterval(() => {
    if (!pending) pending = tick().catch(() => log("knowledgeos-word-search: worker temporarily unavailable")).finally(() => {
      pending = void 0;
    });
  }, 700);
  timer.unref();
  return async () => {
    clearInterval(timer);
    lifecycle.abort();
    await pending;
  };
}

// src/host/zip-store.ts
import { createHash as createHash4, randomUUID as randomUUID6 } from "node:crypto";
var notFound = () => new AssetError(404, "IMPORT_NOT_FOUND");
var uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var ZipStore = class {
  constructor(tx, current, readable) {
    this.tx = tx;
    this.current = current;
    this.readable = readable;
  }
  actor(prior, now) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    return a;
  }
  owned(db, a, id4) {
    const row = db.prepare("SELECT id,title,storage_key,sha256,byte_length FROM zip_imports WHERE id=? AND owner_id=?").get(id4, a.userId);
    if (!row) throw notFound();
    return row;
  }
  stage(prior, spec2, blob, members) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now), old = db.prepare("SELECT * FROM zip_imports WHERE owner_id=? AND upload_key=?").get(a.userId, spec2.key);
      if (old) {
        if (old.sha256 !== blob.sha256 || old.byte_length !== blob.byteLength || old.title !== spec2.title) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { id: String(old.id), replayed: true };
      }
      const id4 = randomUUID6();
      db.prepare("INSERT INTO zip_imports VALUES(?,?,?,?,?,?,?,?)").run(id4, a.userId, spec2.key, spec2.title, blob.key, blob.sha256, blob.byteLength, now);
      const insert = db.prepare(`INSERT INTO zip_entries(id,import_id,ordinal,name,path,byte_length,compressed_size,media_type,reason,state,publish_key) VALUES(?,?,?,?,?,?,?,?,?,'available',?)`);
      for (const m of members) insert.run(randomUUID6(), id4, m.ordinal, m.name, m.path, m.size, m.compressedSize, m.media, m.reason, randomUUID6());
      return { id: id4, replayed: false };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => db.prepare("SELECT id,title,byte_length,sha256,created_at FROM zip_imports WHERE owner_id=? ORDER BY created_at DESC,id").all(this.actor(prior, now).userId));
  }
  source(prior, id4) {
    return this.tx("read", (db, now) => {
      const r = this.owned(db, this.actor(prior, now), id4);
      return { key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length) };
    });
  }
  manifest(prior, id4) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), r = this.owned(db, a, id4);
      const rows = db.prepare(`SELECT e.id,e.name,e.path,e.byte_length AS size,e.compressed_size,e.media_type,e.reason,e.state,e.error,
      v.asset_id,v.id AS version_id,v.version,v.original_name,b.sha256,b.byte_length FROM zip_entries e
      LEFT JOIN asset_versions v ON v.id=e.version_id LEFT JOIN blobs b ON b.id=v.blob_id WHERE e.import_id=? ORDER BY e.ordinal`).all(id4);
      const entries = rows.map(({ asset_id, version_id, version, original_name, sha256, byte_length, ...e }) => {
        const receipt3 = asset_id && this.readable(a, String(asset_id), now) ? { id: asset_id, version_id, version, title: original_name, sha256, byte_length, media_type: e.media_type } : void 0;
        return { ...e, ...receipt3 ? { receipt: receipt3 } : {} };
      });
      const state = rows.some((x) => x.state === "selected") ? "selected" : rows.some((x) => x.state === "failed") ? "partial" : rows.some((x) => x.state === "imported") ? "imported" : "staged";
      return { id: id4, title: r.title, byte_length: r.byte_length, sha256: r.sha256, state, entries };
    });
  }
  select(prior, id4, key, ids) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now);
      this.owned(db, a, id4);
      if (!uuid.test(key) || !Array.isArray(ids) || !ids.length || ids.length > 512 || ids.some((x) => typeof x !== "string" || !uuid.test(x)) || new Set(ids).size !== ids.length) throw new AssetError(422, "INVALID_SELECTION");
      const canonical = JSON.stringify([...ids].sort()), digest4 = createHash4("sha256").update(canonical).digest("hex");
      const seen = db.prepare("SELECT import_id,selection_digest FROM zip_selections WHERE owner_id=? AND request_key=?").get(a.userId, key);
      if (seen && (seen.import_id !== id4 || seen.selection_digest !== digest4)) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
      const get = db.prepare("SELECT id,ordinal,path,media_type,reason,state,publish_key FROM zip_entries WHERE import_id=? AND id=?");
      const members = ids.map((entry) => {
        const r = get.get(id4, entry);
        if (!r || r.reason !== null || !r.media_type) throw new AssetError(422, "INVALID_SELECTION");
        return { id: entry, ordinal: Number(r.ordinal), path: String(r.path), media: String(r.media_type), key: String(r.publish_key), imported: r.state === "imported" };
      });
      if (!seen) db.prepare("INSERT INTO zip_selections VALUES(?,?,?,?,?,?,?)").run(randomUUID6(), id4, a.userId, key, digest4, canonical, now);
      const mark = db.prepare("UPDATE zip_entries SET state='selected',error=NULL WHERE import_id=? AND id=? AND state IN ('available','failed')");
      for (const entry of ids) mark.run(id4, entry);
      return members.sort((a2, b) => a2.ordinal - b.ordinal);
    });
  }
  failure(prior, id4, entry, code) {
    this.tx("write", (db, now) => {
      this.owned(db, this.actor(prior, now), id4);
      db.prepare("UPDATE zip_entries SET state='failed',error=? WHERE import_id=? AND id=? AND state='selected'").run(code, id4, entry);
    });
  }
  // Called inside AssetStore.publish's transaction; never open a nested transaction.
  publication(id4, entry, key) {
    return (db, a, r) => {
      this.owned(db, a, id4);
      const updated = db.prepare(`UPDATE zip_entries SET state='imported',version_id=?,error=NULL WHERE import_id=? AND id=? AND publish_key=?
      AND (state='selected' OR (state='imported' AND version_id=?))`).run(r.version_id, id4, entry, key, r.version_id);
      if (updated.changes !== 1) throw new AssetError(409, "SELECTION_CHANGED");
    };
  }
};

// src/host/parse-store.ts
import { randomUUID as randomUUID7 } from "node:crypto";

// src/host/pdf-chapters.ts
var maxPdfPages = 1e4;
var maxPdfChapters = 100;
function pdfChapters(value, total = maxPdfPages) {
  if (!Number.isSafeInteger(total) || total < 1 || total > maxPdfPages || !Array.isArray(value) || value.length < 1 || value.length > maxPdfChapters)
    throw Error("INVALID_PDF_CHAPTERS");
  const ranges = [];
  let previous = 0;
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) throw Error("INVALID_PDF_CHAPTERS");
    const [first, last] = pair;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first <= previous || last < first || last > total)
      throw Error("INVALID_PDF_CHAPTERS");
    ranges.push([first, last]);
    previous = last;
  }
  return ranges;
}

// src/host/parse-store.ts
var PARSE_SCHEMA = `CREATE TABLE pdf_parse_runs (
  version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), session_id TEXT NOT NULL REFERENCES auth_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('queued','running','complete','partial','failed','cancelled')),
  total INTEGER NOT NULL DEFAULT 0 CHECK(total BETWEEN 0 AND 10000), token TEXT UNIQUE, deadline INTEGER,
  losses INTEGER NOT NULL DEFAULT 0, error TEXT, CHECK ((state='running')=(token IS NOT NULL)), CHECK ((token IS NULL)=(deadline IS NULL))
) STRICT;
CREATE TABLE pdf_pages (
  version_id TEXT NOT NULL REFERENCES pdf_parse_runs(version_id), page INTEGER NOT NULL CHECK(page>=1),
  state TEXT NOT NULL CHECK(state IN ('pending','ready','review','failed')), chapter TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '', error TEXT, generation INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(version_id,page)
) STRICT;
CREATE INDEX pdf_pending ON pdf_pages(version_id,state,page);`;
var PDF_CHAPTER_SCHEMA = `CREATE TABLE pdf_chapter_ranges (
  version_id TEXT NOT NULL REFERENCES pdf_parse_runs(version_id),
  first_page INTEGER NOT NULL CHECK(first_page>=1), last_page INTEGER NOT NULL CHECK(last_page BETWEEN first_page AND 10000),
  PRIMARY KEY(version_id,first_page)
) STRICT;`;
var targeted = `(NOT EXISTS(SELECT 1 FROM pdf_chapter_ranges c WHERE c.version_id=pdf_pages.version_id)
  OR EXISTS(SELECT 1 FROM pdf_chapter_ranges c WHERE c.version_id=pdf_pages.version_id AND pdf_pages.page BETWEEN c.first_page AND c.last_page))`;
var leaseMs = 15e3;
var ParseStore = class {
  constructor(tx, permit) {
    this.tx = tx;
    this.permit = permit;
  }
  operation(actor2, v) {
    const id4 = this.tx("read", (db, now) => {
      const r = db.prepare("SELECT v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id WHERE r.version_id=?").get(v);
      if (!r || !this.permit(actor2.sessionId, actor2.userId, String(r.asset_id), false, now)) throw new AssetError(404, "ASSET_NOT_FOUND");
      return String(r.asset_id);
    });
    return this.control(actor2, id4, v, "status");
  }
  pages(actor2, id4, v, from, limit4) {
    if (!Number.isSafeInteger(from) || from < 1 || !Number.isSafeInteger(limit4) || limit4 < 1 || limit4 > 10) throw new AssetError(422, "INVALID_PAGE_RANGE");
    return this.tx("read", (db, now) => {
      if (!this.permit(actor2.sessionId, actor2.userId, id4, false, now) || !this.pdfVersion(db, id4, v)) throw new AssetError(404, "ASSET_NOT_FOUND");
      const rows = db.prepare(`SELECT page,state,chapter,error,CASE WHEN state IN ('ready','review') THEN text ELSE NULL END AS text
        FROM pdf_pages WHERE version_id=? AND page>=? ORDER BY page LIMIT ?`).all(v, from, limit4);
      return { version_id: v, from, pages: rows };
    });
  }
  control(actor2, id4, v, op, page, requested) {
    return this.tx(op === "status" ? "read" : "write", (db, now) => {
      if (!this.permit(actor2.sessionId, actor2.userId, id4, op !== "status", now) || !this.pdfVersion(db, id4, v)) throw new AssetError(404, "ASSET_NOT_FOUND");
      const prev = db.prepare("SELECT state,error,total FROM pdf_parse_runs WHERE version_id=?").get(v);
      const loadChapters = () => db.prepare("SELECT first_page,last_page FROM pdf_chapter_ranges WHERE version_id=? ORDER BY first_page").all(v).map((p) => [Number(p.first_page), Number(p.last_page)]);
      const plan = loadChapters();
      if (op === "start" || op === "chapters") {
        if (op === "chapters") {
          let ranges;
          try {
            ranges = pdfChapters(requested, Number(prev?.total) || void 0);
          } catch {
            throw new AssetError(422, "INVALID_PDF_CHAPTERS");
          }
          const repair = prev?.state === "failed" && prev.error === "CHAPTER_RANGE_OUTSIDE_DOCUMENT" && prev.total === 0;
          if (prev && !repair && JSON.stringify(ranges) !== JSON.stringify(plan)) throw new AssetError(409, "PDF_CHAPTER_PLAN_FROZEN");
          if (!prev || repair) {
            if (!prev) db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state) VALUES(?,?,?,'queued')").run(v, actor2.sessionId, actor2.userId);
            else db.prepare("DELETE FROM pdf_chapter_ranges WHERE version_id=?").run(v);
            const insert = db.prepare("INSERT INTO pdf_chapter_ranges VALUES(?,?,?)");
            for (const [first, last] of ranges) insert.run(v, first, last);
          }
        } else if (prev?.state === "failed" && prev.error === "CHAPTER_RANGE_OUTSIDE_DOCUMENT") throw new AssetError(409, "PDF_CHAPTER_PLAN_NEEDS_CORRECTION");
        if (!prev && op === "start") db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state) VALUES(?,?,?,'queued')").run(v, actor2.sessionId, actor2.userId);
        else if (prev && ["failed", "cancelled"].includes(String(prev.state))) {
          db.prepare("UPDATE pdf_parse_runs SET session_id=?,user_id=?,state='queued',error=NULL,losses=0 WHERE version_id=?").run(actor2.sessionId, actor2.userId, v);
        }
      } else if (op === "cancel") {
        if (!prev || !["running", "queued", "cancelled"].includes(String(prev.state))) throw new AssetError(409, "PARSE_NOT_ACTIVE");
        db.prepare("UPDATE pdf_parse_runs SET state='cancelled',token=NULL,deadline=NULL,error='CANCELLED' WHERE version_id=?").run(v);
      } else if (op === "retry") {
        if (!prev || prev.state !== "partial" || !page || !db.prepare(`UPDATE pdf_pages SET state='pending',error=NULL
          WHERE version_id=? AND page=? AND state IN ('failed','review') AND ${targeted}`).run(v, page).changes) throw new AssetError(409, "PAGE_NOT_RETRYABLE");
        db.prepare("UPDATE pdf_parse_runs SET state='queued',session_id=?,user_id=?,error=NULL,losses=0 WHERE version_id=?").run(actor2.sessionId, actor2.userId, v);
      }
      const run = db.prepare("SELECT state,total,error FROM pdf_parse_runs WHERE version_id=?").get(v);
      const chapters = op === "chapters" ? loadChapters() : plan;
      const selected = chapters.length ? `,${targeted} AS selected` : "";
      return {
        state: run?.state ?? "idle",
        total: run?.total ?? 0,
        error: run?.error ?? null,
        ...chapters.length ? { chapters } : {},
        pages: db.prepare(`SELECT page,state,chapter,error${selected} FROM pdf_pages WHERE version_id=? ORDER BY page`).all(v)
      };
    });
  }
  pdfVersion(db, id4, v) {
    return db.prepare("SELECT 1 FROM asset_versions a JOIN blobs b ON b.id=a.blob_id WHERE a.asset_id=? AND a.id=? AND b.media_type='application/pdf'").get(id4, v);
  }
  claim() {
    if (!this.tx("read", (db, now) => db.prepare("SELECT 1 FROM pdf_parse_runs WHERE state='queued' OR (state='running' AND deadline<=?) LIMIT 1").get(Date.parse(now)))) return;
    return this.tx("write", (db, now) => {
      const ms = Date.parse(now);
      db.prepare(`UPDATE pdf_parse_runs SET state=CASE WHEN losses>=3 THEN 'failed' ELSE 'queued' END,losses=losses+1,
        token=NULL,deadline=NULL,error='LEASE_EXPIRED' WHERE state='running' AND deadline<=?`).run(ms);
      const r = db.prepare(`SELECT r.version_id,r.session_id,r.user_id,v.asset_id,b.storage_key,b.sha256,b.byte_length
        FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id JOIN blobs b ON b.id=v.blob_id WHERE r.state='queued' ORDER BY r.rowid LIMIT 1`).get();
      if (!r) return;
      const version = String(r.version_id);
      if (!this.permit(String(r.session_id), String(r.user_id), String(r.asset_id), true, now)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',error='AUTHORIZATION_LOST' WHERE version_id=?").run(version);
        return;
      }
      const token2 = randomUUID7();
      db.prepare("UPDATE pdf_parse_runs SET state='running',token=?,deadline=?,error=NULL WHERE version_id=?").run(token2, ms + leaseMs, version);
      return { version, token: token2, key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length) };
    });
  }
  leased(token2, op) {
    return this.tx("write", (db, now) => {
      const ms = Date.parse(now), r = db.prepare(`SELECT r.*,v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id
        WHERE token=? AND state='running' AND deadline>?`).get(token2, ms);
      if (!r) return void 0;
      if (!this.permit(String(r.session_id), String(r.user_id), String(r.asset_id), true, now)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='AUTHORIZATION_LOST' WHERE token=?").run(token2);
        return void 0;
      }
      return op(db, String(r.version_id), ms);
    });
  }
  renew(token2) {
    return this.leased(token2, (db, _v, ms) => Boolean(db.prepare("UPDATE pdf_parse_runs SET deadline=? WHERE token=?").run(ms + leaseMs, token2).changes));
  }
  initialize(token2, total) {
    if (!Number.isSafeInteger(total) || total < 1 || total > 1e4) throw Error("PAGE_COUNT_LIMIT");
    return this.leased(token2, (db, v) => {
      const before = Number(db.prepare("SELECT total FROM pdf_parse_runs WHERE version_id=?").get(v).total);
      if (before && before !== total) throw Error("PAGE_COUNT_CHANGED");
      if (db.prepare("SELECT 1 FROM pdf_chapter_ranges WHERE version_id=? AND last_page>? LIMIT 1").get(v, total)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='CHAPTER_RANGE_OUTSIDE_DOCUMENT' WHERE version_id=?").run(v);
        return false;
      }
      if (!before) {
        db.prepare("UPDATE pdf_parse_runs SET total=? WHERE version_id=?").run(total, v);
        const insert = db.prepare("INSERT INTO pdf_pages(version_id,page,state) VALUES(?,?,'pending')");
        for (let p = 1; p <= total; p++) insert.run(v, p);
      }
      return true;
    });
  }
  next(token2) {
    return this.leased(token2, (db, v) => {
      const pending = db.prepare(`SELECT page FROM pdf_pages WHERE version_id=? AND state='pending' AND ${targeted} ORDER BY page LIMIT 1`).get(v);
      if (pending) return Number(pending.page);
      db.prepare(`UPDATE pdf_parse_runs SET state=CASE WHEN EXISTS(SELECT 1 FROM pdf_pages WHERE version_id=? AND state IN ('failed','review') AND ${targeted})
      THEN 'partial' ELSE 'complete' END,token=NULL,deadline=NULL,error=NULL WHERE version_id=?`).run(v, v);
      return null;
    });
  }
  publish(token2, page, result) {
    return this.leased(token2, (db, v) => {
      if (result && (result.text.length > 262144 || result.chapter.length > 512)) throw Error("PAGE_OUTPUT_LIMIT");
      const state = result ? result.needsReview || !result.text.trim() ? "review" : "ready" : "failed";
      const previous = String(db.prepare("SELECT text FROM pdf_pages WHERE version_id=? AND page=? AND state='pending'").get(v, page)?.text ?? "");
      const text2 = !result || previous !== "" && result.text.trimStart() === previous ? previous : result.text;
      const wrote = db.prepare(`UPDATE pdf_pages SET state=?,text=?,chapter=?,error=?,generation=generation+1
      WHERE version_id=? AND page=? AND state='pending' AND ${targeted}`).run(state, text2, result?.chapter ?? "", result ? null : "PAGE_EXTRACTION_FAILED", v, page);
      if (wrote.changes) {
        db.prepare("UPDATE pdf_parse_runs SET losses=0 WHERE version_id=?").run(v);
        if (result?.confirmedBlank && !text2) db.prepare("INSERT OR IGNORE INTO recall_pdf_blank_pages VALUES(?,?)").run(v, page);
      }
      return Boolean(wrote.changes);
    });
  }
  fail(token2) {
    return this.leased(token2, (db, v) => db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='DOCUMENT_UNAVAILABLE' WHERE version_id=?").run(v));
  }
};

// src/host/text-schema.ts
var TEXT_SCHEMA = `CREATE TEMP TABLE kos_prior_blobs AS SELECT id,storage_key,sha256,byte_length,media_type FROM blobs;
DROP TABLE blobs;
CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','text/plain','text/markdown'))
) STRICT;
INSERT INTO blobs SELECT id,storage_key,sha256,byte_length,media_type FROM kos_prior_blobs;
DROP TABLE kos_prior_blobs;
CREATE TABLE text_versions (version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), encoding TEXT NOT NULL, block_count INTEGER NOT NULL CHECK(block_count>=0)) STRICT;
CREATE TABLE text_blocks (version_id TEXT NOT NULL REFERENCES text_versions(version_id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  kind TEXT NOT NULL, start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>=start), text TEXT NOT NULL, anchor TEXT NOT NULL,
  PRIMARY KEY(version_id,ordinal)) STRICT;`;

// src/host/office-schema.ts
var WORD_MEDIA = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword"
};
var OFFICE_HISTORY_SCHEMA = `CREATE INDEX office_history_version ON office_conversions(version_id);
CREATE INDEX office_history_ready ON office_conversions(version_id) WHERE state='ready';
CREATE INDEX office_history_notes ON office_quality_notes(conversion_id);`;
var OFFICE_AUTH_SCHEMA = `CREATE TABLE office_authorizations (
  conversion_id TEXT PRIMARY KEY REFERENCES office_conversions(id),
  session_id TEXT NOT NULL REFERENCES auth_sessions(id)
) STRICT;`;
var OFFICE_SCHEMA = `CREATE TEMP TABLE kos_office_prior_blobs AS SELECT * FROM blobs;
DROP TABLE blobs;
CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','text/plain','text/markdown','${WORD_MEDIA.docx}','${WORD_MEDIA.doc}'))
) STRICT;
INSERT INTO blobs SELECT id,storage_key,sha256,byte_length,media_type FROM kos_office_prior_blobs;
DROP TABLE kos_office_prior_blobs;
CREATE TABLE office_conversions (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES asset_versions(id),
  actor_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','ready','cancelled','failed','superseded')),
  lease_token TEXT, lease_until TEXT, attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt>=0),
  result_blob_id TEXT UNIQUE REFERENCES blobs(id), page_count INTEGER, missing_fonts TEXT, failure_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(actor_id,request_key),
  CHECK((state='running')=(lease_token IS NOT NULL) AND (state='running')=(lease_until IS NOT NULL)),
  CHECK((state='ready')=(result_blob_id IS NOT NULL)),
  CHECK((state='ready' AND page_count IS NOT NULL AND page_count>0 AND missing_fonts IS NOT NULL)
     OR (state!='ready' AND page_count IS NULL AND missing_fonts IS NULL))
) STRICT;
CREATE UNIQUE INDEX office_one_active ON office_conversions(version_id) WHERE state IN ('queued','running');
CREATE TABLE office_quality_notes (
  id TEXT PRIMARY KEY, conversion_id TEXT NOT NULL REFERENCES office_conversions(id),
  author_id TEXT NOT NULL REFERENCES users(id), page INTEGER NOT NULL CHECK(page>=1),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), created_at TEXT NOT NULL,
  request_key TEXT NOT NULL, UNIQUE(author_id,request_key)
) STRICT;`;

// src/host/office-store.ts
import { randomUUID as randomUUID8 } from "node:crypto";
var historyLimit = 10;
var conversionFields = "id,state,page_count,missing_fonts,failure_code";
var missing = () => new AssetError(404, "ASSET_NOT_FOUND");
var keyPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
var checkKey = (key) => {
  if (!keyPattern.test(key) || key.length !== 36) throw new AssetError(422, "INVALID_IDEMPOTENCY_KEY");
};
var deadline2 = (now) => new Date(Date.parse(now) + 15e3).toISOString();
var due2 = "state='queued' OR (state='running' AND lease_until<=?)";
var sourceSQL2 = `SELECT v.asset_id,v.id AS version_id,b.media_type,b.sha256,b.byte_length,b.storage_key,
  NOT EXISTS(SELECT 1 FROM asset_versions n WHERE n.asset_id=v.asset_id AND n.version>v.version) AS head
  FROM asset_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND b.media_type IN (?,?)`;
var OfficeStore = class {
  constructor(tx, permit) {
    this.tx = tx;
    this.permit = permit;
  }
  sourceRow(db, v) {
    return db.prepare(sourceSQL2).get(v, WORD_MEDIA.doc, WORD_MEDIA.docx);
  }
  access(db, now, a, id4, v, action2) {
    if (!this.permit(a.sessionId, a.userId, id4, "read", now) || action2 !== "read" && !this.permit(a.sessionId, a.userId, id4, action2, now)) throw missing();
    const row = this.sourceRow(db, v);
    if (!row || row.asset_id !== id4) throw missing();
    return row;
  }
  list(a, id4, v, options = {}) {
    return this.tx("read", (db, now) => {
      this.access(db, now, a, id4, v, "read");
      const { before, conversion, notes_before } = options;
      if (Object.keys(options).some((k) => !["before", "conversion", "notes_before"].includes(k)) || [before, conversion, notes_before].some((x) => x !== void 0 && (typeof x !== "string" || x.length !== 36 || !keyPattern.test(x))) || before && conversion || notes_before && !conversion) throw new AssetError(422, "INVALID_HISTORY_CURSOR");
      const seek = (sql, cursor, parent) => {
        const row = db.prepare(sql).get(cursor, parent);
        if (!row) throw missing();
        return row.rowid;
      };
      const notePos = notes_before ? seek("SELECT rowid FROM office_quality_notes WHERE id=? AND conversion_id=?", notes_before, conversion) : void 0;
      const notes = db.prepare(`SELECT id,page,body FROM office_quality_notes WHERE conversion_id=? ${notePos === void 0 ? "" : "AND rowid<?"} ORDER BY rowid DESC LIMIT ?`);
      const present = (r) => {
        const page = notes.all(r.id, ...notePos === void 0 ? [] : [notePos], historyLimit + 1);
        const more2 = page.length > historyLimit;
        if (more2) page.pop();
        return {
          ...r,
          missing_fonts: r.missing_fonts ? JSON.parse(String(r.missing_fonts)) : [],
          ...more2 ? { notes_next_before: page.at(-1).id } : {},
          notes: page.reverse()
        };
      };
      const select = `SELECT ${conversionFields} FROM office_conversions WHERE version_id=?`;
      if (conversion) {
        const row = db.prepare(select + " AND id=?").get(v, conversion);
        if (!row) throw missing();
        return { version_id: v, conversions: [present(row)] };
      }
      const pos = before ? seek("SELECT rowid FROM office_conversions WHERE id=? AND version_id=?", before, v) : void 0;
      const rows = db.prepare(select + (before ? " AND rowid<?" : "") + " ORDER BY rowid DESC LIMIT ?").all(v, ...pos === void 0 ? [] : [pos], historyLimit + 1);
      const more = rows.length > historyLimit;
      if (more) rows.pop();
      const ready = db.prepare(select + " AND state='ready' ORDER BY rowid DESC LIMIT 1").get(v);
      return {
        version_id: v,
        conversions: rows.map(present),
        ...more ? { next_before: rows.at(-1).id } : {},
        ...ready && !rows.some((r) => r.id === ready.id) ? { latest_ready: present(ready) } : {}
      };
    });
  }
  start(a, id4, v, key, available2 = true) {
    return this.tx("write", (db, now) => {
      const row = this.access(db, now, a, id4, v, "edit");
      checkKey(key);
      const prev = db.prepare("SELECT id,version_id,state FROM office_conversions WHERE actor_id=? AND request_key=?").get(a.userId, key);
      if (prev) {
        if (prev.version_id !== v) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { id: String(prev.id), state: String(prev.state), replayed: true };
      }
      if (!row.head) throw new AssetError(409, "SOURCE_CHANGED");
      if (db.prepare("SELECT 1 FROM office_conversions WHERE version_id=? AND state IN ('queued','running')").get(v)) throw new AssetError(409, "CONVERSION_IN_PROGRESS");
      if (!available2) throw new AssetError(503, "OFFICE_UNAVAILABLE");
      const cid = randomUUID8();
      db.prepare("INSERT INTO office_conversions(id,version_id,actor_id,request_key,state,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(cid, v, a.userId, key, now, now);
      db.prepare("INSERT INTO office_authorizations VALUES(?,?)").run(cid, a.sessionId);
      return { id: cid, state: "queued", replayed: false };
    });
  }
  cancel(a, id4, v, cid) {
    return this.tx("write", (db, now) => {
      this.access(db, now, a, id4, v, "edit");
      const row = db.prepare("SELECT state FROM office_conversions WHERE id=? AND version_id=?").get(cid, v);
      if (!row) throw missing();
      if (row.state !== "cancelled") {
        if (row.state !== "running" && row.state !== "queued") throw new AssetError(409, "CONVERSION_NOT_ACTIVE");
        db.prepare("UPDATE office_conversions SET state='cancelled',failure_code='CANCELLED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now, cid);
      }
      return { id: cid, state: "cancelled" };
    });
  }
  result(a, id4, v, cid, download) {
    return this.tx("read", (db, now) => {
      this.access(db, now, a, id4, v, download ? "export" : "read");
      const row = db.prepare("SELECT b.storage_key,b.byte_length,b.sha256 FROM office_conversions c JOIN blobs b ON b.id=c.result_blob_id WHERE c.id=? AND c.version_id=? AND c.state='ready' AND b.media_type='application/pdf'").get(cid, v);
      if (!row) throw missing();
      return { key: String(row.storage_key), byteLength: Number(row.byte_length), sha256: String(row.sha256) };
    });
  }
  note(a, id4, v, cid, key, page, body2) {
    return this.tx("write", (db, now) => {
      this.access(db, now, a, id4, v, "edit");
      checkKey(key);
      const row = db.prepare("SELECT page_count FROM office_conversions WHERE id=? AND version_id=? AND state='ready'").get(cid, v);
      if (!row) throw missing();
      if (!Number.isSafeInteger(page) || page < 1 || page > Number(row.page_count) || typeof body2 !== "string" || !body2.trim() || body2.length > 2e3 || body2.includes("\0")) throw new AssetError(422, "INVALID_QUALITY_NOTE");
      const prev = db.prepare("SELECT id,conversion_id,page,body FROM office_quality_notes WHERE author_id=? AND request_key=?").get(a.userId, key);
      if (prev) {
        if (prev.conversion_id !== cid || prev.page !== page || prev.body !== body2) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { id: String(prev.id), replayed: true };
      }
      const note = randomUUID8();
      db.prepare("INSERT INTO office_quality_notes VALUES(?,?,?,?,?,?,?)").run(note, cid, a.userId, page, body2, now, key);
      return { id: note, replayed: false };
    });
  }
  claim() {
    if (!this.tx("read", (db, now) => db.prepare(`SELECT 1 FROM office_conversions WHERE ${due2} LIMIT 1`).get(now))) return;
    return this.tx("write", (db, now) => {
      const row = db.prepare(`SELECT id,attempt FROM office_conversions WHERE ${due2} ORDER BY rowid LIMIT 1`).get(now);
      if (!row) return;
      if (Number(row.attempt) >= 3) {
        db.prepare("UPDATE office_conversions SET state='failed',failure_code='LEASE_EXPIRED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now, row.id);
        return;
      }
      const token2 = randomUUID8();
      db.prepare("UPDATE office_conversions SET state='running',attempt=attempt+1,lease_token=?,lease_until=?,updated_at=? WHERE id=?").run(token2, deadline2(now), now, row.id);
      return this.authority(db, now, token2) ? { token: token2 } : void 0;
    });
  }
  authority(db, now, token2) {
    const row = db.prepare(`SELECT c.id,c.actor_id,c.version_id,a.session_id FROM office_conversions c LEFT JOIN office_authorizations a ON a.conversion_id=c.id
      WHERE c.state='running' AND c.lease_token=? AND c.lease_until>?`).get(token2, now);
    if (!row) return;
    const source = this.sourceRow(db, String(row.version_id)), session = String(row.session_id), user = String(row.actor_id), asset = String(source?.asset_id);
    if (!source?.head || !row.session_id || !this.permit(session, user, asset, "read", now) || !this.permit(session, user, asset, "edit", now)) {
      db.prepare("UPDATE office_conversions SET state=?,failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(source?.head ? "failed" : "superseded", source?.head ? "AUTHORIZATION_LOST" : "SOURCE_CHANGED", now, row.id);
      return;
    }
    return { assetId: asset, versionId: String(row.version_id), key: String(source.storage_key), sha256: String(source.sha256), byteLength: Number(source.byte_length), extension: source.media_type === WORD_MEDIA.doc ? "doc" : "docx" };
  }
  source(token2) {
    return this.tx("write", (db, now) => this.authority(db, now, token2));
  }
  renew(token2) {
    return this.tx("write", (db, now) => !!this.authority(db, now, token2) && !!db.prepare("UPDATE office_conversions SET lease_until=? WHERE lease_token=?").run(deadline2(now), token2).changes);
  }
  complete(token2, blob, pageCount, fonts) {
    return this.tx("write", (db, now) => {
      if (!this.authority(db, now, token2)) return false;
      if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 1e4 || !Number.isSafeInteger(blob.byteLength) || blob.byteLength <= 0 || blob.byteLength > 64 * 1024 * 1024 || !Array.isArray(fonts) || fonts.length > 1024 || fonts.some((f) => typeof f !== "string" || f.length > 512)) throw new AssetError(422, "INVALID_OFFICE_RESULT");
      const bid = randomUUID8();
      db.prepare("INSERT INTO blobs VALUES(?,?,?,?,'application/pdf')").run(bid, blob.key, blob.sha256, blob.byteLength);
      db.prepare("UPDATE office_conversions SET state='ready',result_blob_id=?,page_count=?,missing_fonts=?,failure_code=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(bid, pageCount, JSON.stringify(fonts), now, token2);
      return true;
    });
  }
  fail(token2, code) {
    this.tx("write", (db, now) => {
      if (!this.authority(db, now, token2)) return;
      db.prepare("UPDATE office_conversions SET state='failed',failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(/^[a-zA-Z0-9_-]{1,64}$/.test(code) ? code : "CONVERSION_FAILED", now, token2);
    });
  }
};

// src/host/zip-schema.ts
var ZIP_SCHEMA = `CREATE TABLE zip_imports (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), upload_key TEXT NOT NULL,
  title TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), created_at TEXT NOT NULL,
  UNIQUE(owner_id,upload_key)
) STRICT;
CREATE INDEX zip_import_owner ON zip_imports(owner_id);
CREATE TABLE zip_entries (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES zip_imports(id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  name TEXT NOT NULL, path TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length>=0),
  compressed_size INTEGER NOT NULL CHECK(compressed_size>=0), media_type TEXT, reason TEXT,
  state TEXT NOT NULL CHECK(state IN ('available','selected','imported','failed')),
  publish_key TEXT NOT NULL UNIQUE, version_id TEXT UNIQUE REFERENCES asset_versions(id), error TEXT,
  CHECK((state='imported')=(version_id IS NOT NULL)), CHECK((state='failed')=(error IS NOT NULL)),
  CHECK(reason IS NULL OR state='available'), UNIQUE(import_id,ordinal), UNIQUE(import_id,path)
) STRICT;
CREATE TABLE zip_selections (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES zip_imports(id), owner_id TEXT NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL, selection_digest TEXT NOT NULL CHECK(length(selection_digest)=64), member_ids TEXT NOT NULL CHECK(json_valid(member_ids) AND json_type(member_ids)='array'), created_at TEXT NOT NULL,
  UNIQUE(owner_id,request_key)
) STRICT;`;

// src/host/citation-store.ts
import { createHash as createHash8, randomUUID as randomUUID11 } from "node:crypto";

// src/host/citation-anchor.ts
import { createHash as createHash5 } from "node:crypto";
function citationAnchor(text2, start, end) {
  const split = (n) => n > 0 && n < text2.length && text2.charCodeAt(n - 1) >= 55296 && text2.charCodeAt(n - 1) <= 56319 && text2.charCodeAt(n) >= 56320 && text2.charCodeAt(n) <= 57343;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text2.length || split(start) || split(end)) throw new AssetError(422, "INVALID_CITATION_RANGE");
  const quote = text2.slice(start, end), hash4 = (s) => createHash5("sha256").update(s, "utf8").digest("hex");
  return { start, end, quote_hash: hash4(quote), source_hash: hash4(text2) };
}
function resolveCitationText(text2, anchor) {
  const digest4 = createHash5("sha256").update(text2, "utf8").digest("hex");
  if (digest4 !== anchor.source_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
  const actual = citationAnchor(text2, anchor.start, anchor.end);
  if (actual.quote_hash !== anchor.quote_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
  return text2.slice(anchor.start, anchor.end);
}

// src/host/citation-locator.ts
import { createHash as createHash6 } from "node:crypto";
var hash = (x) => createHash6("sha256").update(x, "utf8").digest("hex");
function makeLocator(s, text2, start, end, neighbors, w) {
  const word = s.kind === "office" ? w?.word : void 0;
  if (s.kind === "office" && (!word?.blocks.length || word.source_sha256 !== s.wordOriginal?.sha256)) throw new AssetError(422, "WORD_STRUCTURE_UNVERIFIED");
  const first = word?.blocks[0], last = word?.blocks.at(-1);
  const lo = first ? Math.min(start, first.page_start) : 0, hi = last ? Math.max(end, last.page_end) : text2.length;
  const blockId = first?.block_id ?? hash(JSON.stringify([s.version_id, null, s.ordinal, lo, hi]));
  const context = {
    block_id: blockId,
    block_start: lo,
    block_end: hi,
    previous: first ? first.previous : neighbors.previous,
    next: last ? last.next : neighbors.next,
    before_hash: hash(text2.slice(Math.max(0, start - 64), start)),
    after_hash: hash(text2.slice(end, end + 64))
  };
  if (s.kind === "text") return { context, geometry: null };
  if (!w || !s.ref || s.ref.sha256 !== w.sha256 || s.conversion_id !== w.conversion_id || s.ordinal !== w.ordinal || w.text !== text2) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
  const boxes = w.boxes.filter((b) => b.start < end && b.end > start).map(({ start: start2, end: end2, x, y, width, height }) => ({ start: start2, end: end2, x, y, width, height }));
  return { context, geometry: { page: s.ordinal, width: w.width, height: w.height, source_sha256: w.sha256, boxes }, ...word ? { word } : {} };
}

// src/host/reading-state.ts
import { createHash as createHash7, randomUUID as randomUUID9 } from "node:crypto";
var pointColumns = `ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 1000000),
  conversion_id TEXT REFERENCES office_conversions(id), source_hash TEXT NOT NULL CHECK(length(source_hash)=64)`;
var READING_STATE_SCHEMA = `CREATE TABLE reading_positions (
  user_id TEXT NOT NULL REFERENCES users(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ${pointColumns}, revision INTEGER NOT NULL CHECK(revision>0), PRIMARY KEY(user_id,version_id)
) STRICT;
CREATE TABLE reading_bookmarks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ${pointColumns}, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120)
) STRICT;
CREATE INDEX reading_bookmarks_scope ON reading_bookmarks(user_id,version_id);`;
var canRemember = (s) => s.state === "ready" || s.state === "review";
var positionHash = (s) => s.kind === "office" ? s.ref.sha256 : createHash7("sha256").update(s.text).digest("hex");
var samePoint = (s, p) => canRemember(s) && s.ordinal === p.ordinal && s.conversion_id === p.conversion_id && positionHash(s) === p.source_hash;
var point = (r) => ({ ordinal: Number(r.ordinal), source_hash: String(r.source_hash), ...r.conversion_id ? { conversion_id: String(r.conversion_id) } : {} });
var columns = "ordinal,conversion_id,source_hash";
function readNavigation(db, user, version, valid2) {
  const r = db.prepare(`SELECT revision,${columns} FROM reading_positions WHERE user_id=? AND version_id=?`).get(user, version);
  const p = r ? point(r) : null;
  const bookmarks = db.prepare(`SELECT id,title,${columns} FROM reading_bookmarks WHERE user_id=? AND version_id=? ORDER BY rowid`).all(user, version);
  return { actor_id: user, revision: Number(r?.revision ?? 0), position: p && valid2(p) ? p : null, bookmarks: bookmarks.map((r2) => ({ id: String(r2.id), title: String(r2.title), ...point(r2) })) };
}
function savePosition(db, user, version, p, expected) {
  const revision = expected + 1;
  const change = expected === 0 ? db.prepare("INSERT INTO reading_positions(user_id,version_id,ordinal,conversion_id,source_hash,revision) VALUES(?,?,?,?,?,1) ON CONFLICT DO NOTHING").run(user, version, p.ordinal, p.conversion_id ?? null, p.source_hash) : db.prepare("UPDATE reading_positions SET ordinal=?,conversion_id=?,source_hash=?,revision=? WHERE user_id=? AND version_id=? AND revision=?").run(p.ordinal, p.conversion_id ?? null, p.source_hash, revision, user, version, expected);
  if (change.changes !== 1) throw new AssetError(409, "READING_REVISION_CONFLICT");
  return { revision, position: { ordinal: p.ordinal, source_hash: p.source_hash, ...p.conversion_id ? { conversion_id: p.conversion_id } : {} } };
}
function createBookmark(db, user, version, p, title) {
  if (Number(db.prepare("SELECT count(*) AS n FROM reading_bookmarks WHERE user_id=? AND version_id=?").get(user, version)?.n) >= 200) throw new AssetError(409, "BOOKMARK_LIMIT");
  const id4 = randomUUID9();
  db.prepare("INSERT INTO reading_bookmarks(id,user_id,version_id,ordinal,conversion_id,source_hash,title) VALUES(?,?,?,?,?,?,?)").run(id4, user, version, p.ordinal, p.conversion_id ?? null, p.source_hash, title);
  return { id: id4, title, ordinal: p.ordinal, source_hash: p.source_hash, ...p.conversion_id ? { conversion_id: p.conversion_id } : {} };
}

// src/host/annotation-store.ts
import { randomUUID as randomUUID10 } from "node:crypto";
var ANNOTATION_SCHEMA = `CREATE TABLE reader_annotations (
  id TEXT PRIMARY KEY, citation_id TEXT NOT NULL REFERENCES citations(id),
  author_id TEXT NOT NULL REFERENCES users(id), project_id TEXT REFERENCES knowledge_projects(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000), revision INTEGER NOT NULL CHECK(revision>=1)
) STRICT;
CREATE INDEX reader_annotations_citation ON reader_annotations(citation_id);`;
var records = `SELECT a.id,a.citation_id,a.author_id,a.project_id,a.body,a.revision,c.ordinal,c.start,c.end,c.source_hash,c.conversion_id
  FROM reader_annotations a JOIN citations c ON c.id=a.citation_id`;
var inSource = "c.asset_id=? AND c.version_id=? AND c.ordinal=? AND c.conversion_id IS ?";
var args = (t) => [t.asset_id, t.version_id, t.ordinal, t.conversion_id ?? null];
var hidden = () => new AssetError(404, "ANNOTATION_NOT_FOUND");
var visibleAnnotation = (r, user, scope) => r.project_id === null ? r.author_id === user : r.project_id === scope.project_id;
function dto(r, user, scope) {
  return {
    id: String(r.id),
    citation_id: String(r.citation_id),
    ordinal: Number(r.ordinal),
    start: Number(r.start),
    end: Number(r.end),
    source_hash: String(r.source_hash),
    ...r.conversion_id ? { conversion_id: String(r.conversion_id) } : {},
    visibility: r.project_id ? "project" : "private",
    body: String(r.body),
    revision: Number(r.revision),
    can_edit: r.author_id === user && scope.canComment
  };
}
function listAnnotations(db, t, user, scope) {
  const rows = db.prepare(`${records} WHERE ${inSource} AND ((a.project_id IS NULL AND a.author_id=?) OR a.project_id=?) ORDER BY a.rowid`).all(...args(t), user, scope.project_id ?? null);
  return { actor_id: user, can_comment: scope.canComment, can_share: scope.canComment && Boolean(scope.project_id), items: rows.map((r) => dto(r, user, scope)) };
}
function insertAnnotation(db, t, user, scope, draft, citation) {
  const project = draft.visibility === "project" ? scope.project_id : null;
  if (draft.visibility === "project" && !project) throw new AssetError(422, "ANNOTATION_SCOPE_UNAVAILABLE");
  const count = db.prepare(`${records.replace(/^SELECT[\s\S]*?FROM/, "SELECT count(*) AS n FROM")} WHERE ${inSource} AND a.project_id IS ?${project ? "" : " AND a.author_id=?"}`).get(...args(t), project ?? null, ...project ? [] : [user]);
  if (Number(count?.n) >= 200) throw new AssetError(409, "ANNOTATION_LIMIT");
  const id4 = randomUUID10();
  db.prepare("INSERT INTO reader_annotations VALUES(?,?,?,?,?,1)").run(id4, draft.citation_id, user, project ?? null, draft.body);
  return dto({ ...citation, id: id4, citation_id: draft.citation_id, author_id: user, project_id: project ?? null, body: draft.body, revision: 1 }, user, scope);
}
function mutateAnnotation(db, t, user, scope, id4, revision, body2) {
  const row = db.prepare(`${records} WHERE ${inSource} AND a.id=? AND a.author_id=?`).get(...args(t), id4, user);
  if (!row || !visibleAnnotation(row, user, scope)) throw hidden();
  if (row.revision !== revision) throw new AssetError(409, "ANNOTATION_REVISION_CONFLICT");
  if (body2 === void 0) {
    db.prepare("DELETE FROM reader_annotations WHERE id=?").run(id4);
    return { id: id4 };
  }
  db.prepare("UPDATE reader_annotations SET body=?,revision=? WHERE id=?").run(body2, revision + 1, id4);
  return dto({ ...row, body: body2, revision: revision + 1 }, user, scope);
}

// src/host/citation-store.ts
var CITATION_SCHEMA = `CREATE TABLE citations (
  id TEXT PRIMARY KEY, created_by TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), quote_hash TEXT NOT NULL CHECK(length(quote_hash)=64),
  created_at TEXT NOT NULL, UNIQUE(created_by,request_key)
) STRICT;`;
var notFound2 = () => new AssetError(404, "SOURCE_NOT_FOUND");
var invalid = () => new AssetError(422, "INVALID_READER_UNIT");
var sha2 = (s) => createHash8("sha256").update(s, "utf8").digest("hex");
var uuid2 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var fields = "id,asset_id,version_id,conversion_id,ordinal,start,end,source_hash,quote_hash";
function dto2(row) {
  const { conversion_id, ...rest } = row;
  return { ...rest, ...conversion_id ? { conversion_id } : {} };
}
var CitationStore = class {
  constructor(tx, current, allowed, annotationAccess, readHorizon) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
    this.annotationAccess = annotationAccess;
    this.readHorizon = readHorizon;
  }
  actor(prior, now) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    return a;
  }
  read(db, a, t, now) {
    if (!this.allowed(a, t.asset_id, now)) throw notFound2();
    const r = db.prepare(`SELECT v.original_name,b.media_type,b.storage_key,b.sha256,b.byte_length FROM asset_versions v
      JOIN blobs b ON b.id=v.blob_id WHERE v.asset_id=? AND v.id=?`).get(t.asset_id, t.version_id);
    if (!r) throw notFound2();
    if (!Number.isSafeInteger(t.ordinal) || t.ordinal < 1) throw invalid();
    const base = { asset_id: t.asset_id, version_id: t.version_id, ordinal: t.ordinal, title: String(r.original_name), chapter: "", text: "" };
    if (r.media_type === "text/plain" || r.media_type === "text/markdown") {
      if (t.conversion_id) throw notFound2();
      const v = db.prepare("SELECT block_count FROM text_versions WHERE version_id=?").get(t.version_id);
      const total2 = Number(v?.block_count ?? 0);
      if (!total2 && t.ordinal === 1) return { ...base, kind: "text", total: total2, state: "empty" };
      const block = db.prepare("SELECT text,kind FROM text_blocks WHERE version_id=? AND ordinal=?").get(t.version_id, t.ordinal);
      if (!block) throw invalid();
      return { ...base, kind: "text", total: total2, state: "ready", text: String(block.text), chapter: String(block.kind) };
    }
    if (r.media_type === "application/pdf") {
      if (t.conversion_id) throw notFound2();
      const v = db.prepare("SELECT total,state FROM pdf_parse_runs WHERE version_id=?").get(t.version_id), total2 = Number(v?.total ?? 0);
      if (total2 && t.ordinal > total2) throw invalid();
      const p = db.prepare("SELECT state,text,chapter FROM pdf_pages WHERE version_id=? AND page=?").get(t.version_id, t.ordinal);
      const state = String(p?.state ?? v?.state ?? "idle");
      const withText = p && (state === "ready" || state === "review");
      return { ...base, kind: "pdf", total: total2, state, text: withText ? String(p.text) : "", chapter: String(p?.chapter ?? ""), ref: { key: String(r.storage_key), byteLength: Number(r.byte_length), sha256: String(r.sha256) } };
    }
    const sql = `SELECT c.id,c.page_count,b.storage_key,b.byte_length,b.sha256 FROM office_conversions c JOIN blobs b ON b.id=c.result_blob_id
      WHERE c.version_id=? AND c.state='ready' `;
    const c = t.conversion_id ? db.prepare(sql + "AND c.id=?").get(t.version_id, t.conversion_id) : db.prepare(sql + "ORDER BY c.rowid DESC LIMIT 1").get(t.version_id);
    if (!c) {
      if (t.conversion_id) throw notFound2();
      return { ...base, kind: "office", total: 0, state: "unconverted" };
    }
    if (r.media_type !== WORD_MEDIA.doc && r.media_type !== WORD_MEDIA.docx) throw notFound2();
    const total = Number(c.page_count);
    if (t.ordinal > total) throw invalid();
    return {
      ...base,
      conversion_id: String(c.id),
      kind: "office",
      total,
      state: "ready",
      ref: { key: String(c.storage_key), byteLength: Number(c.byte_length), sha256: String(c.sha256) },
      wordOriginal: { key: String(r.storage_key), byteLength: Number(r.byte_length), sha256: String(r.sha256), media: r.media_type }
    };
  }
  source(prior, t) {
    return this.tx("read", (db, now) => this.read(db, this.actor(prior, now), t, now));
  }
  recallSource(db, actor2, t, now) {
    const s = this.read(db, actor2, t, now);
    if (s.kind === "office") {
      if (!t.conversion_id || s.conversion_id !== t.conversion_id) throw new AssetError(422, "RECALL_CONVERSION_REQUIRED");
      const page = db.prepare(`SELECT q.blank,p.text FROM office_conversions c JOIN recall_word_sources q
        ON q.conversion_id=c.id AND q.result_blob_id=c.result_blob_id
        LEFT JOIN word_search_pages p ON p.conversion_id=q.conversion_id AND p.page=q.page
        WHERE c.id=? AND q.page=?`).get(s.conversion_id, s.ordinal);
      if (!page || !page.blank && typeof page.text !== "string") throw new AssetError(409, "RECALL_SOURCE_NOT_READY");
      return { ...s, text: page.blank ? "" : String(page.text) };
    }
    if (s.kind === "pdf" && !s.text && db.prepare("SELECT 1 FROM recall_pdf_blank_pages WHERE version_id=? AND page=?").get(s.version_id, s.ordinal)) return s;
    if (s.state !== "ready") throw new AssetError(409, "RECALL_SOURCE_NOT_READY");
    return s;
  }
  navigation(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), src = this.read(db, a, { ...t, ordinal: 1 }, now);
      return readNavigation(db, a.userId, t.version_id, (p) => {
        if (src.conversion_id !== p.conversion_id || p.ordinal > src.total) return false;
        try {
          return samePoint(this.read(db, a, { ...t, ...p }, now), p);
        } catch (e) {
          if (e instanceof AssetError && e.code === "INVALID_READER_UNIT") return false;
          throw e;
        }
      });
    });
  }
  outline(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), source = this.read(db, a, t, now);
      const items = source.kind === "text" ? db.prepare("SELECT ordinal,text FROM text_blocks WHERE version_id=? AND kind='heading' ORDER BY ordinal LIMIT 2048").all(t.version_id).flatMap((row) => {
        const lines = String(row.text).trimEnd().split(/\r\n|\r|\n/), first = lines[0];
        const atx = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
        const label = atx.test(first) ? first.replace(atx, "").replace(/[ \t]+#+[ \t]*$/, "") : lines.slice(0, -1).map((line) => line.trim()).join(" ");
        const title = label.trim().slice(0, 250);
        return title ? [{ ordinal: Number(row.ordinal), title }] : [];
      }) : [];
      return { actor_id: a.userId, source, items };
    });
  }
  writer(prior, expectedActor, now) {
    const a = this.actor(prior, now);
    if (a.userId !== expectedActor) throw new AssetError(409, "READER_ACTOR_CHANGED");
    return a;
  }
  savePosition(prior, t, revision, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now);
      const src = this.read(db, a, { asset_id: t.asset_id, version_id: t.version_id, ordinal: t.ordinal }, now);
      if (!samePoint(src, t)) throw new AssetError(409, "READING_SOURCE_CHANGED");
      return savePosition(db, a.userId, t.version_id, t, revision);
    });
  }
  addBookmark(prior, t, title, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), src = this.read(db, a, t, now);
      if (!samePoint(src, t)) throw new AssetError(409, "READING_SOURCE_CHANGED");
      return createBookmark(db, a.userId, t.version_id, t, title);
    });
  }
  deleteBookmark(prior, t, id4, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now);
      this.read(db, a, t, now);
      const del = db.prepare("DELETE FROM reading_bookmarks WHERE id=? AND user_id=? AND version_id=?").run(id4, a.userId, t.version_id);
      if (del.changes !== 1) throw notFound2();
      return { id: id4 };
    });
  }
  annotatable(db, a, t, now, write = false) {
    const src = this.read(db, a, t, now), scope = this.annotationAccess?.(a, t.asset_id, now);
    if (!scope || write && !scope.canComment) throw notFound2();
    return { src, scope };
  }
  listAnnotations(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), { src, scope } = this.annotatable(db, a, t, now);
      return listAnnotations(db, src, a.userId, scope);
    });
  }
  addAnnotation(prior, t, draft, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), { src, scope } = this.annotatable(db, a, t, now, true);
      const row = db.prepare(`SELECT ${fields} FROM citations WHERE id=? AND created_by=? AND asset_id=? AND version_id=? AND ordinal=? AND conversion_id IS ?`).get(draft.citation_id, a.userId, src.asset_id, src.version_id, src.ordinal, src.conversion_id ?? null);
      if (!row) throw notFound2();
      if (src.state !== "ready" && src.state !== "review" || src.kind !== "office" && row.source_hash !== sha2(src.text)) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      return insertAnnotation(db, src, a.userId, scope, draft, dto2(row));
    });
  }
  updateAnnotation(prior, t, id4, revision, body2, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), { src, scope } = this.annotatable(db, a, t, now, true);
      return mutateAnnotation(db, src, a.userId, scope, id4, revision, body2);
    });
  }
  deleteAnnotation(prior, t, id4, revision, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), { src, scope } = this.annotatable(db, a, t, now, true);
      return mutateAnnotation(db, src, a.userId, scope, id4, revision);
    });
  }
  access(prior, asset, version) {
    return this.tx("read", (db, now) => {
      const actor2 = this.actor(prior, now), expires = this.readHorizon ? this.readHorizon(actor2, asset, now) : this.allowed(actor2, asset, now) ? null : void 0;
      if (expires === void 0) throw notFound2();
      const row = db.prepare(`SELECT v.version,NOT EXISTS(SELECT 1 FROM asset_versions n WHERE n.asset_id=v.asset_id AND n.version>v.version) AS latest
      FROM asset_versions v WHERE v.asset_id=? AND v.id=?`).get(asset, version);
      if (!row) throw notFound2();
      return { actor_id: actor2.userId, asset_id: asset, version_id: version, version: Number(row.version), is_latest: !!row.latest, server_time: now, read_expires_at: expires };
    });
  }
  text(s, w) {
    if (s.state !== "ready" && s.state !== "review") throw new AssetError(409, "SOURCE_NOT_READY");
    if (s.kind !== "office") return s.text;
    if (!w || w.conversion_id !== s.conversion_id || w.sha256 !== s.ref?.sha256 || w.ordinal !== s.ordinal) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
    return w.text;
  }
  locator(db, id4) {
    const r = db.prepare("SELECT snapshot FROM citation_locators WHERE citation_id=?").get(id4);
    return r ? JSON.parse(String(r.snapshot)) : null;
  }
  receipt(db, a, now, spec2, key, range) {
    const old = db.prepare(`SELECT ${fields} FROM citations WHERE created_by=? AND request_key=?`).get(a.userId, key);
    if (!old) return;
    if (!this.allowed(a, String(old.asset_id), now)) throw notFound2();
    if (old.asset_id !== spec2.asset_id || old.version_id !== spec2.version_id || old.ordinal !== spec2.ordinal || old.conversion_id !== (spec2.conversion_id ?? null) || old.start !== range.start || old.end !== range.end || old.source_hash !== range.source_hash) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
    return { data: { ...dto2(old), locator: this.locator(db, String(old.id)) }, replayed: true };
  }
  replay(prior, spec2, key, w) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), src = this.read(db, a, spec2, now), text2 = this.text(src, w);
      if (!uuid2.test(key)) throw new AssetError(422, "INVALID_CITATION");
      if (sha2(text2) !== spec2.source_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      return this.receipt(db, a, now, spec2, key, citationAnchor(text2, spec2.start, spec2.end));
    });
  }
  create(prior, spec2, key, w) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now), src = this.read(db, a, spec2, now);
      if (!uuid2.test(key) || src.kind === "office" && !spec2.conversion_id) throw new AssetError(422, "INVALID_CITATION");
      const text2 = this.text(src, w);
      if (sha2(text2) !== spec2.source_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      const range = citationAnchor(text2, spec2.start, spec2.end);
      const old = this.receipt(db, a, now, spec2, key, range);
      if (old) return old;
      const neighbor = (n) => {
        if (src.kind !== "text") return null;
        const r = db.prepare("SELECT anchor FROM text_blocks WHERE version_id=? AND ordinal=?").get(src.version_id, n);
        return r ? String(r.anchor) : null;
      };
      const locator = makeLocator(src, text2, spec2.start, spec2.end, { previous: neighbor(src.ordinal - 1), next: neighbor(src.ordinal + 1) }, w);
      const id4 = randomUUID11();
      db.prepare("INSERT INTO citations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id4, a.userId, key, spec2.asset_id, spec2.version_id, spec2.conversion_id ?? null, spec2.ordinal, range.start, range.end, range.source_hash, range.quote_hash, now);
      db.prepare("INSERT INTO citation_locators(citation_id,snapshot) VALUES(?,?)").run(id4, JSON.stringify(locator));
      return { data: { ...spec2, ...range, id: id4, locator }, replayed: false };
    });
  }
  lookup(db, a, id4, now) {
    const r = db.prepare(`SELECT ${fields} FROM citations WHERE id=?`).get(id4);
    if (!r || !this.allowed(a, String(r.asset_id), now)) throw notFound2();
    return dto2(r);
  }
  target(prior, id4) {
    return this.tx("read", (db, now) => this.lookup(db, this.actor(prior, now), id4, now));
  }
  resolve(prior, id4, w) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), r = this.lookup(db, a, id4, now), source = this.read(db, a, r, now);
      return { ...r, quote: resolveCitationText(this.text(source, w), r), locator: this.locator(db, id4) };
    });
  }
};

// src/host/citation-locator-schema.ts
var CITATION_LOCATOR_SCHEMA = `CREATE TABLE citation_locators (
  citation_id TEXT PRIMARY KEY REFERENCES citations(id),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND json_type(snapshot)='object')
) STRICT;`;

// src/host/note-store.ts
import { createHash as createHash9, randomUUID as randomUUID12 } from "node:crypto";

// src/host/note-input.ts
var noteKinds = ["plain", "reading", "project", "reflection"];
var noteLimits = { title: 200, body: 32e3, references: 64 };
var noteId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function noteText(value, max2) {
  return typeof value === "string" && value.length <= max2 && value.isWellFormed() && !value.includes("\0");
}

// src/host/note-outline.ts
var outlineLimit = 256;
var Outline = class {
  byId;
  byParent = /* @__PURE__ */ new Map();
  constructor(nodes) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (n.parent_id === null) continue;
      const siblings = this.byParent.get(n.parent_id) ?? [];
      siblings.push(n);
      this.byParent.set(n.parent_id, siblings);
    }
    for (const list of this.byParent.values()) list.sort((a, b) => a.order_key - b.order_key);
  }
  children(id4) {
    return this.byParent.get(id4) ?? [];
  }
  descendants(id4) {
    const out = [], stack = [...this.children(id4)].reverse(), seen = /* @__PURE__ */ new Set([id4]);
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n.id)) throw new Error("Outline has a cycle");
      seen.add(n.id);
      out.push(n);
      stack.push(...[...this.children(n.id)].reverse());
    }
    return out;
  }
  slots(parent, nodes) {
    return nodes.flatMap((n, order_key) => n.parent_id === parent && n.order_key === order_key ? [] : [{ id: n.id, parent_id: parent, order_key, archived: false }]);
  }
  move(id4, parent, index) {
    const n = this.byId.get(id4), target3 = this.byId.get(parent);
    if (!n?.parent_id || !target3 || id4 === parent || this.descendants(id4).some((x) => x.id === parent)) return;
    const destination = this.children(parent).filter((x) => x.id !== id4);
    if (!Number.isSafeInteger(index) || index < 0 || index > destination.length) return;
    destination.splice(index, 0, n);
    const source = n.parent_id === parent ? [] : this.slots(n.parent_id, this.children(n.parent_id).filter((x) => x.id !== id4));
    return [...this.slots(parent, destination), ...source];
  }
  remove(id4, mode) {
    const n = this.byId.get(id4);
    if (!n?.parent_id) return;
    const kept = this.children(n.parent_id).flatMap((x) => x.id === id4 ? mode === "promote" ? this.children(id4) : [] : [x]);
    const removed = mode === "subtree" ? [n, ...this.descendants(id4)] : [n];
    return [...this.slots(n.parent_id, kept), ...removed.map((x) => ({ id: x.id, parent_id: x.parent_id, order_key: x.order_key, archived: true }))];
  }
};

// src/host/note-store.ts
var NOTE_SCHEMA = `CREATE TABLE notes (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES spaces(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  note_kind TEXT NOT NULL CHECK(note_kind IN ('plain','reading','project','reflection')),
  revision INTEGER NOT NULL CHECK(revision>=1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  create_key TEXT NOT NULL, create_digest TEXT NOT NULL CHECK(length(create_digest)=64),
  UNIQUE(service_id, owner_user_id, create_key)
) STRICT;
CREATE INDEX notes_owner_order ON notes(service_id, owner_user_id, id);
CREATE TABLE note_nodes (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), parent_id TEXT,
  order_key INTEGER NOT NULL, body TEXT NOT NULL, body_revision INTEGER NOT NULL CHECK(body_revision>=1),
  UNIQUE(note_id,id), FOREIGN KEY(note_id,parent_id) REFERENCES note_nodes(note_id,id)
) STRICT;
CREATE UNIQUE INDEX note_single_root ON note_nodes(note_id) WHERE parent_id IS NULL;
CREATE TABLE note_references (
  id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES note_nodes(id), citation_id TEXT NOT NULL REFERENCES citations(id),
  UNIQUE(node_id,citation_id)
) STRICT;
CREATE TABLE project_note_refs (
  project_id TEXT NOT NULL REFERENCES knowledge_projects(id), note_id TEXT NOT NULL REFERENCES notes(id),
  created_at TEXT NOT NULL, PRIMARY KEY(project_id,note_id)
) STRICT;`;
var NOTE_OUTLINE_SCHEMA = `ALTER TABLE note_nodes ADD COLUMN archived_at TEXT CHECK(archived_at IS NULL OR parent_id IS NOT NULL);
CREATE INDEX note_outline_live ON note_nodes(note_id,parent_id,order_key) WHERE archived_at IS NULL;
CREATE TABLE note_outline_undo (
  note_id TEXT PRIMARY KEY REFERENCES notes(id), revision INTEGER NOT NULL CHECK(revision>=2),
  placements TEXT NOT NULL CHECK(json_valid(placements))
) STRICT;`;
var rowFields = "id,title,note_kind AS kind,revision,updated_at";
var notFound3 = () => new AssetError(404, "NOTE_NOT_FOUND");
var invalid2 = () => new AssetError(422, "INVALID_NOTE");
var conflict = () => new AssetError(409, "REVISION_CONFLICT");
function draftValid(d) {
  if (!noteText(d.title, noteLimits.title) || !d.title.trim() || !noteText(d.body, noteLimits.body) || !noteKinds.includes(d.kind)) throw invalid2();
}
var NoteStore = class {
  constructor(tx, current, canReadAsset, projectMember, projectManager) {
    this.tx = tx;
    this.current = current;
    this.canReadAsset = canReadAsset;
    this.projectMember = projectMember;
    this.projectManager = projectManager;
  }
  actor(session, now, expected) {
    const actor2 = this.current(session, now);
    if (!actor2) throw new AssetError(401, "AUTH_REQUIRED");
    if (expected !== void 0 && actor2.userId !== expected) throw new AssetError(409, "ACTOR_CHANGED");
    return actor2;
  }
  owned(db, a, id4) {
    const row = db.prepare(`SELECT ${rowFields} FROM notes WHERE id=? AND service_id=? AND owner_user_id=?`).get(id4, a.serviceId, a.userId);
    if (!row) throw notFound3();
    return row;
  }
  detail(db, a, id4, now) {
    const meta = this.owned(db, a, id4);
    const root = db.prepare("SELECT id,body FROM note_nodes WHERE note_id=? AND parent_id IS NULL").get(id4);
    if (!root) throw Error("Note root is missing");
    const refs = db.prepare(`SELECT r.id,r.citation_id,c.asset_id,c.version_id FROM note_references r JOIN citations c ON c.id=r.citation_id
      WHERE r.node_id=? ORDER BY r.rowid`).all(root.id);
    return { ...meta, body: String(root.body), outline: { nodes: this.nodes(db, id4), can_undo: !!this.undoRow(db, id4, meta.revision) }, references: refs.map((r) => this.canReadAsset(a, String(r.asset_id), now) ? { id: String(r.id), status: "linked", citation_id: String(r.citation_id), asset_id: String(r.asset_id), version_id: String(r.version_id) } : { id: String(r.id), status: "unavailable" }) };
  }
  nodes(db, id4) {
    return db.prepare(`SELECT id,parent_id,order_key,body,body_revision FROM note_nodes
      WHERE note_id=? AND archived_at IS NULL ORDER BY parent_id,order_key,id`).all(id4);
  }
  undoRow(db, id4, revision) {
    return db.prepare("SELECT placements FROM note_outline_undo WHERE note_id=? AND revision=?").get(id4, revision);
  }
  assertRevision(expected, current) {
    if (!Number.isSafeInteger(expected) || expected < 1) throw invalid2();
    if (expected !== current) throw conflict();
  }
  deleteImpact(outline, id4, revision, node) {
    if (!outline.byId.get(node)?.parent_id) throw new AssetError(422, "INVALID_OUTLINE_TARGET");
    const child_ids = outline.children(node).map((n) => n.id), descendant_ids = outline.descendants(node).map((n) => n.id);
    const preview_token = createHash9("sha256").update(JSON.stringify([id4, revision, node, child_ids, descendant_ids])).digest("hex");
    return { preview_token, child_ids, descendant_ids };
  }
  previewDelete(session, expected, id4, revision, node) {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now, expected), meta = this.owned(db, a, id4);
      this.assertRevision(revision, meta.revision);
      return this.deleteImpact(new Outline(this.nodes(db, id4)), id4, revision, node);
    });
  }
  changeOutline(session, expected, id4, revision, op) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected), meta = this.owned(db, a, id4);
      this.assertRevision(revision, meta.revision);
      const outline = new Outline(this.nodes(db, id4)), badTarget = () => new AssetError(422, "INVALID_OUTLINE_TARGET");
      let placements;
      if (op.action === "add") {
        if (!outline.byId.has(op.parent_id)) throw badTarget();
        if (!noteText(op.body, noteLimits.body)) throw invalid2();
        if (outline.byId.size >= outlineLimit) throw new AssetError(409, "OUTLINE_LIMIT");
        db.prepare("INSERT INTO note_nodes(id,note_id,parent_id,order_key,body,body_revision) VALUES(?,?,?,?,?,1)").run(randomUUID12(), id4, op.parent_id, outline.children(op.parent_id).length, op.body);
      } else if (op.action === "edit") {
        const existing = outline.byId.get(op.node_id);
        if (!existing) throw badTarget();
        if (!noteText(op.body, noteLimits.body)) throw invalid2();
        if (existing.body === op.body) return this.detail(db, a, id4, now);
        db.prepare("UPDATE note_nodes SET body=?,body_revision=body_revision+1 WHERE note_id=? AND id=?").run(op.body, id4, op.node_id);
      } else if (op.action === "undo") {
        const previous = this.undoRow(db, id4, revision);
        if (!previous) throw new AssetError(409, "OUTLINE_UNDO_UNAVAILABLE");
        placements = JSON.parse(String(previous.placements));
      } else if (op.action === "move") {
        placements = outline.move(op.node_id, op.parent_id, op.index);
        if (!placements) throw badTarget();
        if (!placements.length) return this.detail(db, a, id4, now);
      } else {
        const impact = this.deleteImpact(outline, id4, revision, op.node_id);
        if (op.preview_token !== impact.preview_token) throw new AssetError(409, "OUTLINE_PREVIEW_REQUIRED");
        if (op.mode !== "subtree" && op.mode !== "promote") throw invalid2();
        placements = outline.remove(op.node_id, op.mode);
        if (!placements) throw badTarget();
      }
      if (placements && op.action !== "undo") {
        const before = placements.map((p) => {
          const n = outline.byId.get(p.id);
          return { id: n.id, parent_id: n.parent_id, order_key: n.order_key, archived: false };
        });
        db.prepare(`INSERT INTO note_outline_undo VALUES(?,?,?)
        ON CONFLICT(note_id) DO UPDATE SET revision=excluded.revision,placements=excluded.placements`).run(id4, revision + 1, JSON.stringify(before));
      } else db.prepare("DELETE FROM note_outline_undo WHERE note_id=?").run(id4);
      if (placements) {
        const update = db.prepare("UPDATE note_nodes SET parent_id=?,order_key=?,archived_at=? WHERE note_id=? AND id=? AND parent_id IS NOT NULL");
        for (const p of placements) if (!update.run(p.parent_id, p.order_key, p.archived ? now : null, id4, p.id).changes) throw new Error("Missing outline placement");
      }
      if (!db.prepare("UPDATE notes SET revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(now, id4, revision).changes) throw conflict();
      return this.detail(db, a, id4, now);
    });
  }
  assertCitation(db, a, id4, now) {
    if (!noteId.test(id4)) throw invalid2();
    const c = db.prepare("SELECT asset_id FROM citations WHERE id=?").get(id4);
    if (!c || !this.canReadAsset(a, String(c.asset_id), now)) throw new AssetError(404, "SOURCE_NOT_FOUND");
  }
  list(session, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now);
      if (after && !noteId.test(after)) throw invalid2();
      const rows = db.prepare(`SELECT ${rowFields} FROM notes WHERE service_id=? AND owner_user_id=? AND id>? ORDER BY id LIMIT 51`).all(a.serviceId, a.userId, after);
      return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
    });
  }
  get(session, id4) {
    return this.tx("read", (db, now) => this.detail(db, this.actor(session, now), id4, now));
  }
  create(session, expected, key, d, citation) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected);
      draftValid(d);
      if (!noteId.test(key)) throw invalid2();
      const digest4 = createHash9("sha256").update(JSON.stringify([d.title, d.body, d.kind, ...citation === void 0 ? [] : [citation]])).digest("hex");
      const old = db.prepare("SELECT id,create_digest FROM notes WHERE service_id=? AND owner_user_id=? AND create_key=?").get(a.serviceId, a.userId, key);
      if (old) {
        if (old.create_digest !== digest4) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { data: this.detail(db, a, String(old.id), now), replayed: true };
      }
      const id4 = randomUUID12();
      if (citation !== void 0) this.assertCitation(db, a, citation, now);
      db.prepare("INSERT INTO notes VALUES(?,?,?,?,?,?,1,?,?,?,?)").run(id4, a.serviceId, a.personalSpaceId, a.userId, d.title, d.kind, now, now, key, digest4);
      db.prepare("INSERT INTO note_nodes(id,note_id,parent_id,order_key,body,body_revision) VALUES(?,?,NULL,0,?,1)").run(id4, id4, d.body);
      if (citation !== void 0) db.prepare("INSERT INTO note_references VALUES(?,?,?)").run(randomUUID12(), id4, citation);
      return { data: this.detail(db, a, id4, now), replayed: false };
    });
  }
  save(session, expected, id4, revision, patch) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected), old = this.detail(db, a, id4, now);
      if (!Number.isSafeInteger(revision) || revision < 1 || !Object.keys(patch).length) throw invalid2();
      if (revision !== old.revision) throw conflict();
      const d = { title: patch.title ?? old.title, kind: patch.kind ?? old.kind, body: patch.body ?? old.body };
      draftValid(d);
      const { add_citation: add, remove_reference: remove } = patch;
      if (add !== void 0 && remove !== void 0) throw invalid2();
      let referenceChanged = false;
      if (add !== void 0) {
        this.assertCitation(db, a, add, now);
        if (!old.references.some((r) => r.citation_id === add)) {
          if (old.references.length >= noteLimits.references) throw new AssetError(409, "NOTE_REFERENCE_LIMIT");
          db.prepare("INSERT INTO note_references VALUES(?,?,?)").run(randomUUID12(), id4, add);
          referenceChanged = true;
        }
      } else if (remove !== void 0) {
        if (!noteId.test(remove)) throw invalid2();
        referenceChanged = !!db.prepare("DELETE FROM note_references WHERE node_id=? AND id=?").run(id4, remove).changes;
        if (!referenceChanged) throw notFound3();
      }
      if (referenceChanged || d.title !== old.title || d.kind !== old.kind || d.body !== old.body) {
        if (!db.prepare("UPDATE notes SET title=?,note_kind=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(d.title, d.kind, now, id4, revision).changes) throw conflict();
        db.prepare("DELETE FROM note_outline_undo WHERE note_id=?").run(id4);
        if (d.body !== old.body) db.prepare("UPDATE note_nodes SET body=?,body_revision=body_revision+1 WHERE id=?").run(d.body, id4);
      }
      return this.detail(db, a, id4, now);
    });
  }
  linkProject(session, expected, project, id4) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected);
      this.owned(db, a, id4);
      if (!this.projectMember(a, project, now) || !this.projectManager(a, project)) throw new AssetError(404, "PROJECT_NOT_FOUND");
      const made = db.prepare("INSERT INTO project_note_refs VALUES(?,?,?) ON CONFLICT(project_id,note_id) DO NOTHING").run(project, id4, now);
      return { project_id: project, note_id: id4, replayed: !made.changes };
    });
  }
  managedProjects(session, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now);
      if (after && !noteId.test(after)) throw invalid2();
      const items = db.prepare(`SELECT p.id,p.name FROM knowledge_projects p JOIN project_memberships m ON m.project_id=p.id AND m.user_id=?
      WHERE p.owner_user_id=? AND p.service_id=? AND p.status='active' AND p.id>? AND m.revoked_at IS NULL
      AND m.valid_from<=? AND (m.expires_at IS NULL OR m.expires_at>?) ORDER BY p.id LIMIT 51`).all(a.userId, a.userId, a.serviceId, after, now, now);
      return { items: items.slice(0, 50), next: items.length > 50 ? String(items[49].id) : null };
    });
  }
  projectRefs(session, project, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now);
      if (after && !noteId.test(after)) throw invalid2();
      if (!this.projectMember(a, project, now)) throw new AssetError(404, "PROJECT_NOT_FOUND");
      const rows = db.prepare(`SELECT n.id,n.title,n.note_kind AS kind,n.revision,n.updated_at FROM project_note_refs r
      JOIN notes n ON n.id=r.note_id WHERE r.project_id=? AND n.service_id=? AND n.owner_user_id=? AND n.id>?
      ORDER BY n.id LIMIT 51`).all(project, a.serviceId, a.userId, after);
      return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
    });
  }
};

// src/host/recall-store.ts
import { createHash as createHash11, randomUUID as randomUUID13 } from "node:crypto";

// src/host/recall-range.ts
import { createHash as createHash10 } from "node:crypto";
var digest = (text2) => createHash10("sha256").update(text2, "utf8").digest("hex");
var invalid3 = () => new AssetError(422, "INVALID_RECALL_RANGE");
var changed = () => new AssetError(409, "RECALL_SOURCE_CHANGED");
var available = (text2) => {
  if (text2 === void 0) throw new AssetError(409, "RECALL_SOURCE_NOT_READY");
  return text2;
};
function boundary(text2, n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > text2.length) return false;
  const a = text2.charCodeAt(n - 1), b = text2.charCodeAt(n);
  return !(a >= 55296 && a <= 56319 && b >= 56320 && b <= 57343);
}
function recallSelection(first, last, interior, total, read) {
  if (![first.ordinal, last.ordinal, total].every(Number.isSafeInteger) || first.ordinal < 1 || last.ordinal < first.ordinal || last.ordinal > total) throw invalid3();
  if (interior.length !== Math.max(0, last.ordinal - first.ordinal - 1)) throw invalid3();
  const segments = [];
  for (let ordinal = first.ordinal; ordinal <= last.ordinal; ordinal++) {
    const text2 = available(read(ordinal)), source_hash = digest(text2);
    if (ordinal === first.ordinal && source_hash !== first.source_hash || ordinal === last.ordinal && source_hash !== last.source_hash || ordinal > first.ordinal && ordinal < last.ordinal && source_hash !== interior[ordinal - first.ordinal - 1]) throw changed();
    const start = ordinal === first.ordinal ? first.offset : 0, end = ordinal === last.ordinal ? last.offset : text2.length;
    if (!boundary(text2, start) || !boundary(text2, end) || start > end) throw invalid3();
    segments.push({ ordinal, start, end, source_hash });
  }
  if (!segments.some((s) => s.end > s.start)) throw invalid3();
  return segments;
}
function recallMasks(segments, masks, read) {
  const byPage = new Map(segments.map((s) => [s.ordinal, s])), normalized = masks.map((m) => ({ ...m })).sort((a, b) => a.ordinal - b.ordinal || a.start - b.start || a.end - b.end);
  let previous, text2 = "";
  for (const m of normalized) {
    const s = byPage.get(m.ordinal);
    if (!s || !Number.isSafeInteger(m.group) || m.group < 1 || m.start < s.start || m.end > s.end || m.start >= m.end) throw invalid3();
    if (previous?.ordinal !== m.ordinal) {
      text2 = available(read(m.ordinal));
      if (digest(text2) !== s.source_hash) throw changed();
    } else if (m.start < previous.end) throw invalid3();
    if (!boundary(text2, m.start) || !boundary(text2, m.end)) throw invalid3();
    previous = m;
  }
  return normalized;
}
function recallPractice(segment, masks, revealed, text2) {
  if (digest(text2) !== segment.source_hash) throw changed();
  const runs = [];
  let offset = segment.start;
  const visible = (start, end) => {
    if (end > start) runs.push({ kind: "text", text: text2.slice(start, end) });
  };
  for (const m of masks) {
    if (m.ordinal !== segment.ordinal) continue;
    visible(offset, m.start);
    if (revealed.has(m.group)) visible(m.start, m.end);
    else runs.push({ kind: "hidden", group: m.group, length: m.end - m.start });
    offset = m.end;
  }
  visible(offset, segment.end);
  return runs;
}

// src/host/recall-store.ts
var RECALL_SCHEMA = `CREATE TABLE recall_pdf_blank_pages (
  version_id TEXT NOT NULL, page INTEGER NOT NULL,
  PRIMARY KEY(version_id,page), FOREIGN KEY(version_id,page) REFERENCES pdf_pages(version_id,page)
) STRICT;
CREATE TABLE recall_word_sources (
  conversion_id TEXT NOT NULL REFERENCES word_search_runs(conversion_id), page INTEGER NOT NULL CHECK(page>=1),
  result_blob_id TEXT NOT NULL REFERENCES blobs(id), blank INTEGER NOT NULL CHECK(blank IN (0,1)),
  PRIMARY KEY(conversion_id,page)
) STRICT;
CREATE TABLE recall_materials (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id), service_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), title TEXT NOT NULL, created_at TEXT NOT NULL,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(service_id,owner_user_id,request_key)
) STRICT;
CREATE INDEX recall_materials_owner ON recall_materials(service_id,owner_user_id,id);
CREATE TABLE recall_segments (
  material_id TEXT NOT NULL REFERENCES recall_materials(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>=start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), PRIMARY KEY(material_id,ordinal)
) STRICT;
CREATE TABLE recall_masks (
  material_id TEXT NOT NULL, ordinal INTEGER NOT NULL, start INTEGER NOT NULL CHECK(start>=0),
  end INTEGER NOT NULL CHECK(end>start), mask_group INTEGER NOT NULL CHECK(mask_group>=1),
  PRIMARY KEY(material_id,ordinal,start), FOREIGN KEY(material_id,ordinal) REFERENCES recall_segments(material_id,ordinal)
) STRICT;
CREATE TABLE recall_attempts (
  material_id TEXT PRIMARY KEY, active_ordinal INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1),
  FOREIGN KEY(material_id,active_ordinal) REFERENCES recall_segments(material_id,ordinal)
) STRICT;
CREATE TABLE recall_events (
  material_id TEXT NOT NULL REFERENCES recall_attempts(material_id), revision INTEGER NOT NULL CHECK(revision>=2),
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64), event TEXT NOT NULL,
  value INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(material_id,revision), UNIQUE(material_id,request_key),
  CHECK(event IN ('move','hint','reveal','recall','rating'))
) STRICT;
CREATE INDEX recall_events_groups ON recall_events(material_id,event,value);`;
var sha3 = (text2) => createHash11("sha256").update(text2).digest("hex");
var invalid4 = () => new AssetError(422, "INVALID_RECALL");
var notFound4 = () => new AssetError(404, "RECALL_NOT_FOUND");
var point2 = (t, ordinal) => ({ asset_id: t.asset_id, version_id: t.version_id, ordinal, ...t.conversion_id ? { conversion_id: t.conversion_id } : {} });
var RecallStore = class {
  constructor(tx, current, allowed, source) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
    this.source = source;
  }
  actor(prior, now, expected) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    if (expected !== void 0 && expected !== a.userId) throw new AssetError(409, "ACTOR_CHANGED");
    return a;
  }
  material(db, a, id4, now) {
    const row = db.prepare(`SELECT id,title,asset_id,version_id,conversion_id FROM recall_materials WHERE id=? AND service_id=? AND owner_user_id=?`).get(id4, a.serviceId, a.userId);
    if (!row || !this.allowed(a, row.asset_id, now)) throw notFound4();
    return row;
  }
  practice(db, a, m, now) {
    const attempt = db.prepare("SELECT active_ordinal,revision FROM recall_attempts WHERE material_id=?").get(m.id);
    const ordinal = Number(attempt.active_ordinal);
    const segment = db.prepare("SELECT ordinal,start,end,source_hash FROM recall_segments WHERE material_id=? AND ordinal=?").get(m.id, ordinal);
    const source = this.source(db, a, point2(m, ordinal), now);
    const masks = db.prepare('SELECT ordinal,start,end,mask_group AS "group" FROM recall_masks WHERE material_id=? AND ordinal=? ORDER BY start').all(m.id, ordinal);
    const events = db.prepare(`SELECT event,value,count(*) AS count FROM recall_events WHERE material_id=? AND event IN ('hint','reveal','recall') GROUP BY event,value`).all(m.id);
    const ratings = db.prepare("SELECT value FROM recall_events WHERE material_id=? AND event='rating' ORDER BY revision DESC LIMIT 1").get(m.id);
    const revealed = new Set(events.filter((e) => e.event === "reveal").map((e) => Number(e.value)));
    const recalled = events.filter((e) => e.event === "recall").map((e) => Number(e.value));
    const bounds = db.prepare("SELECT min(ordinal) AS first,max(ordinal) AS last,sum(end-start) AS length FROM recall_segments WHERE material_id=?").get(m.id);
    const head = db.prepare("SELECT id FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1").get(m.asset_id);
    const conversion = m.conversion_id ? db.prepare("SELECT id FROM office_conversions WHERE version_id=? AND state='ready' ORDER BY rowid DESC LIMIT 1").get(m.version_id) : void 0;
    return {
      material: m,
      ordinal,
      revision: Number(attempt.revision),
      first: Number(bounds.first),
      last: Number(bounds.last),
      length: Number(bounds.length),
      page_length: segment.end - segment.start,
      source_changed: head?.id !== m.version_id || Boolean(m.conversion_id && conversion?.id !== m.conversion_id),
      runs: recallPractice(segment, masks, revealed, source.text),
      progress: {
        hints: events.filter((e) => e.event === "hint").map((e) => ({ group: Number(e.value), count: Number(e.count) })),
        revealed: [...revealed],
        independent_recall: recalled,
        self_rating: ratings ? Number(ratings.value) : null
      }
    };
  }
  authorPage(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), s = this.source(db, a, t, now);
      return { actor_id: a.userId, ordinal: s.ordinal, total: s.total, text: s.text, title: s.title, source_hash: sha3(s.text) };
    });
  }
  list(prior, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), items = [];
      for (const row of db.prepare("SELECT id,title,asset_id FROM recall_materials WHERE service_id=? AND owner_user_id=? AND id>? ORDER BY id").iterate(a.serviceId, a.userId, after)) {
        if (!this.allowed(a, String(row.asset_id), now)) continue;
        items.push({ id: String(row.id), title: String(row.title) });
        if (items.length === 51) break;
      }
      return { items: items.slice(0, 50), next: items.length > 50 ? items[49].id : null };
    });
  }
  get(prior, id4) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now);
      return this.practice(db, a, this.material(db, a, id4, now), now);
    });
  }
  create(prior, expected, key, draft) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), digest4 = sha3(JSON.stringify(draft));
      const old = db.prepare("SELECT id,request_digest FROM recall_materials WHERE service_id=? AND owner_user_id=? AND request_key=?").get(a.serviceId, a.userId, key);
      if (old) {
        const m2 = this.material(db, a, String(old.id), now);
        if (old.request_digest !== digest4) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { data: this.practice(db, a, m2, now), replayed: true };
      }
      if (!draft.title.trim() || draft.title.length > 200 || !draft.masks.length) throw invalid4();
      const first = this.source(db, a, point2(draft, draft.first.ordinal), now);
      const read = (n) => n === first.ordinal ? first.text : this.source(db, a, point2(draft, n), now).text;
      const segments = recallSelection(draft.first, draft.last, draft.interior_hashes, first.total, read), masks = recallMasks(segments, draft.masks, read), id4 = randomUUID13();
      const m = { id: id4, title: draft.title, asset_id: draft.asset_id, version_id: draft.version_id, conversion_id: draft.conversion_id ?? null };
      db.prepare("INSERT INTO recall_materials VALUES(?,?,?,?,?,?,?,?,?,?)").run(id4, a.userId, a.serviceId, m.asset_id, m.version_id, m.conversion_id, m.title, now, key, digest4);
      const insert = db.prepare("INSERT INTO recall_segments VALUES(?,?,?,?,?)");
      for (const s of segments) insert.run(id4, s.ordinal, s.start, s.end, s.source_hash);
      const maskInsert = db.prepare("INSERT INTO recall_masks VALUES(?,?,?,?,?)");
      for (const mask of masks) maskInsert.run(id4, mask.ordinal, mask.start, mask.end, mask.group);
      db.prepare("INSERT INTO recall_attempts VALUES(?,?,1)").run(id4, draft.first.ordinal);
      return { data: this.practice(db, a, m, now), replayed: false };
    });
  }
  act(prior, expected, id4, key, action2) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), m = this.material(db, a, id4, now), digest4 = sha3(JSON.stringify(action2));
      const priorEvent = db.prepare("SELECT request_digest FROM recall_events WHERE material_id=? AND request_key=?").get(id4, key);
      if (priorEvent) {
        if (priorEvent.request_digest !== digest4) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return this.practice(db, a, m, now);
      }
      const attempt = db.prepare("SELECT active_ordinal,revision FROM recall_attempts WHERE material_id=?").get(id4);
      if (attempt.revision !== action2.expected_revision) throw new AssetError(409, "REVISION_CONFLICT");
      const { event, value } = action2, ordinal = event === "move" ? value : Number(attempt.active_ordinal);
      if (!Number.isSafeInteger(value) || value < 1) throw invalid4();
      if (event === "move") {
        if (!db.prepare("SELECT 1 FROM recall_segments WHERE material_id=? AND ordinal=?").get(id4, ordinal)) throw invalid4();
      } else if (event === "hint" || event === "reveal" || event === "recall") {
        if (!db.prepare("SELECT 1 FROM recall_masks WHERE material_id=? AND ordinal=? AND mask_group=?").get(id4, ordinal, value)) throw invalid4();
        if (event === "recall" && db.prepare("SELECT 1 FROM recall_events WHERE material_id=? AND value=? AND event IN ('hint','reveal','recall')").get(id4, value))
          throw new AssetError(409, "RECALL_NOT_INDEPENDENT");
      } else if (event === "rating" ? value > 5 : true) throw invalid4();
      const revision = action2.expected_revision + 1;
      db.prepare("UPDATE recall_attempts SET active_ordinal=?,revision=? WHERE material_id=?").run(ordinal, revision, id4);
      db.prepare("INSERT INTO recall_events VALUES(?,?,?,?,?,?,?)").run(id4, revision, key, digest4, event, value, now);
      return this.practice(db, a, m, now);
    });
  }
};

// src/host/invitation-store.ts
import { createHash as createHash12, randomBytes, randomUUID as randomUUID14 } from "node:crypto";
var INVITATION_SCHEMA = `CREATE TABLE invitations (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  service_id TEXT NOT NULL, issuer_id TEXT NOT NULL REFERENCES users(id),
  object_id TEXT REFERENCES knowledge_objects(id), project_id TEXT REFERENCES knowledge_projects(id),
  permission TEXT NOT NULL CHECK(permission IN ('read','edit','member')),
  issued_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>issued_at), revoked_at TEXT,
  max_redemptions INTEGER NOT NULL CHECK(max_redemptions BETWEEN 1 AND 100),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK(redeemed_count BETWEEN 0 AND max_redemptions),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1), request_key TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64), UNIQUE(service_id,issuer_id,request_key),
  CHECK((object_id IS NOT NULL AND project_id IS NULL AND permission IN ('read','edit'))
    OR (project_id IS NOT NULL AND object_id IS NULL AND permission='member'))
) STRICT;
CREATE TABLE invitation_redemptions (
  id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invitations(id), user_id TEXT NOT NULL REFERENCES users(id),
  redeemed_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>redeemed_at), revoked_at TEXT,
  UNIQUE(invitation_id,user_id)
) STRICT;
CREATE INDEX invitation_redemptions_user ON invitation_redemptions(user_id,invitation_id);
CREATE INDEX invitations_object ON invitations(object_id);
CREATE INDEX invitations_project ON invitations(project_id);
CREATE TABLE invitation_audit (
  invitation_id TEXT NOT NULL REFERENCES invitations(id), revision INTEGER NOT NULL CHECK(revision>=1),
  actor_id TEXT NOT NULL REFERENCES users(id), event TEXT NOT NULL CHECK(event IN ('issue','redeem','renew','revoke')),
  occurred_at TEXT NOT NULL, prior_expires_at TEXT, expires_at TEXT NOT NULL,
  affected_count INTEGER NOT NULL CHECK(affected_count>=0), PRIMARY KEY(invitation_id,revision)
) STRICT;`;
var INVITATION_EVENT_SCHEMA = `CREATE TABLE domain_events (
  seq INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
  aggregate_revision INTEGER NOT NULL CHECK(aggregate_revision>=1), actor_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL, payload_schema_version INTEGER NOT NULL CHECK(payload_schema_version>=1),
  payload TEXT NOT NULL CHECK(json_valid(payload)), occurred_at TEXT NOT NULL, causation_id TEXT,
  correlation_id TEXT NOT NULL, UNIQUE(aggregate_type,aggregate_id,aggregate_revision)
) STRICT;
CREATE TABLE domain_event_outbox (
  event_id TEXT PRIMARY KEY REFERENCES domain_events(event_id), created_at TEXT NOT NULL,
  delivered_at TEXT, failures INTEGER NOT NULL DEFAULT 0 CHECK(failures>=0), retry_at TEXT, last_error TEXT
) STRICT;`;
var INVITATION_CHANGE_SCHEMA = `CREATE TABLE invitation_change_receipts (
  service_id TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  invitation_id TEXT NOT NULL REFERENCES invitations(id), request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)), PRIMARY KEY(service_id,actor_id,request_key)
) STRICT;`;
var day = 864e5;
var digest2 = (value) => createHash12("sha256").update(value).digest("hex");
var invalid5 = () => new AssetError(422, "INVALID_INVITATION");
var unavailable = () => new AssetError(404, "INVITATION_UNAVAILABLE");
var conflict2 = () => new AssetError(409, "INVITATION_CHANGED");
var target = (r) => r.project_id ? { scope: "project", id: r.project_id, permission: "member" } : { scope: "object", id: r.object_id, permission: r.permission };
function duration(days = 7) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw invalid5();
  return days * day;
}
function cap(n = 1) {
  if (!Number.isInteger(n) || n < 1 || n > 100) throw invalid5();
  return n;
}
function receipt2(r) {
  return {
    id: r.id,
    target: target(r),
    issued_at: r.issued_at,
    expires_at: r.expires_at,
    revoked_at: r.revoked_at,
    max_redemptions: r.max_redemptions,
    redeemed_count: r.redeemed_count,
    revision: r.revision
  };
}
var active = (r, now) => r.revoked_at === null && now < r.expires_at;
function recordEvent(db, r, a, event, now, before, affected, correlation) {
  db.prepare("INSERT INTO invitation_audit VALUES(?,?,?,?,?,?,?,?)").run(r.id, r.revision, a.userId, event, now, before, r.expires_at, affected.length);
  const eventId = randomUUID14(), payload = JSON.stringify({
    target: target(r),
    prior_expires_at: before,
    expires_at: r.expires_at,
    revoked_at: r.revoked_at,
    affected_redemption_ids: affected.toSorted()
  });
  db.prepare(`INSERT INTO domain_events(event_id,aggregate_type,aggregate_id,aggregate_revision,actor_id,event_type,
    payload_schema_version,payload,occurred_at,correlation_id) VALUES(?,'invitation',?,?,?, ?,1,?,?,?)`).run(eventId, r.id, r.revision, a.userId, "knowledgeos.invitation." + event, payload, now, correlation);
  db.prepare("INSERT INTO domain_event_outbox (event_id,created_at) VALUES(?,?)").run(eventId, now);
}
var InvitationStore = class {
  constructor(tx, current, principal, canIssue, isMember) {
    this.tx = tx;
    this.current = current;
    this.principal = principal;
    this.canIssue = canIssue;
    this.isMember = isMember;
  }
  actor(prior, now, expected) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    if (a.userId !== expected) throw new AssetError(409, "ACTOR_CHANGED");
    return a;
  }
  issueTarget(a, t, now) {
    const scope = this.canIssue(a, t, now);
    if (!scope) throw unavailable();
    return scope;
  }
  managed(db, a, id4, now) {
    const r = db.prepare("SELECT * FROM invitations WHERE service_id=? AND id=?").get(a.serviceId, id4);
    if (!r) throw unavailable();
    return { r, title: this.issueTarget(a, target(r), now).title };
  }
  issueSpec(a, s, now) {
    const { scope, id: id4, permission } = s, t = { scope, id: id4, permission };
    const info = this.issueTarget(a, t, now), expires_at = new Date(Date.parse(now) + duration(s.days)).toISOString();
    return { target: t, title: info.title, expires_at, max_redemptions: cap(s.max_redemptions), server_time: now };
  }
  preview(prior, expected, s) {
    return this.tx("read", (_db, now) => {
      return this.issueSpec(this.actor(prior, now, expected), s, now);
    });
  }
  create(prior, expected, s, key, correlation = randomUUID14()) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), p = this.issueSpec(a, s, now);
      const req = digest2(JSON.stringify([p.target, s.days ?? 7, p.max_redemptions]));
      const old = db.prepare("SELECT * FROM invitations WHERE service_id=? AND issuer_id=? AND request_key=?").get(a.serviceId, a.userId, key);
      if (old) {
        if (old.request_digest !== req) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { ...receipt2(old), title: p.title, server_time: now, replayed: true };
      }
      const token2 = randomBytes(32).toString("base64url");
      const r = {
        id: randomUUID14(),
        service_id: a.serviceId,
        issuer_id: a.userId,
        object_id: s.scope === "object" ? s.id : null,
        project_id: s.scope === "project" ? s.id : null,
        permission: s.permission,
        issued_at: now,
        expires_at: p.expires_at,
        revoked_at: null,
        max_redemptions: p.max_redemptions,
        redeemed_count: 0,
        revision: 1
      };
      db.prepare(`INSERT INTO invitations(id,token_hash,service_id,issuer_id,object_id,project_id,permission,issued_at,expires_at,max_redemptions,request_key,request_digest)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id, digest2(token2), a.serviceId, a.userId, r.object_id, r.project_id, r.permission, now, r.expires_at, r.max_redemptions, key, req);
      recordEvent(db, r, a, "issue", now, null, [], correlation);
      return { ...receipt2(r), title: p.title, token: token2, server_time: now, replayed: false };
    });
  }
  redeem(prior, expected, token2, correlation = randomUUID14()) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected);
      if (!/^[a-zA-Z0-9_-]{43}$/.test(token2)) throw unavailable();
      const r = db.prepare("SELECT * FROM invitations WHERE service_id=? AND token_hash=?").get(a.serviceId, digest2(token2));
      if (!r || !active(r, now)) throw unavailable();
      const t = target(r), issuer = this.principal(db, r.issuer_id, a.serviceId);
      if (!issuer || issuer.userId === a.userId) throw unavailable();
      const info = this.issueTarget(issuer, t, now);
      if (t.scope === "object" && info.project_id && !this.isMember(a, info.project_id, now)) throw unavailable();
      const priorRedemption = db.prepare("SELECT id,redeemed_at,expires_at,revoked_at FROM invitation_redemptions WHERE invitation_id=? AND user_id=?").get(r.id, a.userId);
      if (priorRedemption) {
        if (!active(priorRedemption, now)) throw unavailable();
        return { id: priorRedemption.id, target: t, title: info.title, expires_at: priorRedemption.expires_at, server_time: now, replayed: true };
      }
      if (r.redeemed_count >= r.max_redemptions) throw new AssetError(409, "INVITATION_FULL");
      const grant = randomUUID14();
      db.prepare("INSERT INTO invitation_redemptions VALUES(?,?,?,?,?,NULL)").run(grant, r.id, a.userId, now, r.expires_at);
      const change = db.prepare("UPDATE invitations SET redeemed_count=redeemed_count+1,revision=revision+1 WHERE id=? AND revision=? AND redeemed_count<max_redemptions").run(r.id, r.revision);
      if (change.changes !== 1) throw conflict2();
      recordEvent(db, { ...r, revision: r.revision + 1 }, a, "redeem", now, null, [grant], correlation);
      return { id: grant, target: t, title: info.title, expires_at: r.expires_at, server_time: now, replayed: false };
    });
  }
  get(prior, expected, id4) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now, expected), { r, title } = this.managed(db, a, id4, now);
      const rows = db.prepare("SELECT id,user_id,expires_at FROM invitation_redemptions WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY id").all(id4, now);
      return { ...receipt2(r), title, active: active(r, now), affected: rows, server_time: now };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now, prior.userId);
      const rows = db.prepare("SELECT * FROM invitations WHERE service_id=? AND issuer_id=? ORDER BY issued_at DESC,id DESC LIMIT 100").all(a.serviceId, a.userId);
      const items = rows.flatMap((r) => {
        const scope = this.canIssue(a, target(r), now);
        return scope ? [{ ...receipt2(r), title: scope.title, active: active(r, now) }] : [];
      });
      return { actor_id: a.userId, server_time: now, items };
    });
  }
  change(prior, expected, id4, expectedRevision, event, days, key = randomUUID14(), correlation = randomUUID14()) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), { r } = this.managed(db, a, id4, now);
      const extension = event === "renew" ? duration(days) : 0, req = digest2(JSON.stringify([id4, expectedRevision, event, extension]));
      const priorReceipt = db.prepare("SELECT request_digest,result_json FROM invitation_change_receipts WHERE service_id=? AND actor_id=? AND request_key=?").get(a.serviceId, a.userId, key);
      if (priorReceipt) {
        if (priorReceipt.request_digest !== req) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { ...JSON.parse(String(priorReceipt.result_json)), replayed: true };
      }
      if (!active(r, now)) throw unavailable();
      if (expectedRevision !== r.revision) throw conflict2();
      const expires_at = event === "renew" ? new Date(Date.parse(r.expires_at) + extension).toISOString() : r.expires_at;
      const changed2 = (event === "renew" ? db.prepare("UPDATE invitation_redemptions SET expires_at=? WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>? RETURNING id").all(expires_at, id4, now) : db.prepare("UPDATE invitation_redemptions SET revoked_at=? WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>? RETURNING id").all(now, id4, now)).map((r2) => String(r2.id));
      const next = { ...r, expires_at, revoked_at: event === "revoke" ? now : null, revision: r.revision + 1 };
      db.prepare("UPDATE invitations SET expires_at=?,revoked_at=?,revision=? WHERE id=?").run(expires_at, next.revoked_at, next.revision, id4);
      const result = { ...receipt2(next), affected_count: changed2.length, server_time: now };
      db.prepare("INSERT INTO invitation_change_receipts VALUES(?,?,?,?,?,?)").run(a.serviceId, a.userId, key, id4, req, JSON.stringify(result));
      recordEvent(db, next, a, event, now, r.expires_at, changed2, correlation);
      return { ...result, replayed: false };
    });
  }
};

// src/host/storage.ts
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 26;
var MIGRATION_V26_CHECKSUM = createHash13("sha256").update(NOTE_OUTLINE_SCHEMA).digest("hex");
var MIGRATION_V25_CHECKSUM = createHash13("sha256").update(INVITATION_CHANGE_SCHEMA).digest("hex");
var MIGRATION_V24_CHECKSUM = createHash13("sha256").update(INVITATION_EVENT_SCHEMA).digest("hex");
var MIGRATION_V23_CHECKSUM = createHash13("sha256").update(INVITATION_SCHEMA).digest("hex");
var MIGRATION_V22_CHECKSUM = createHash13("sha256").update(RECALL_SCHEMA).digest("hex");
var MIGRATION_V21_CHECKSUM = createHash13("sha256").update(NOTE_SCHEMA).digest("hex");
var MIGRATION_V20_CHECKSUM = createHash13("sha256").update(PDF_CHAPTER_SCHEMA).digest("hex");
var MIGRATION_V19_CHECKSUM = createHash13("sha256").update(WORD_SEARCH_SCHEMA).digest("hex");
var MIGRATION_V18_CHECKSUM = createHash13("sha256").update(SEARCH_SCHEMA).digest("hex");
var MIGRATION_V17_CHECKSUM = createHash13("sha256").update(ANNOTATION_SCHEMA).digest("hex");
var MIGRATION_V16_CHECKSUM = createHash13("sha256").update(READING_STATE_SCHEMA).digest("hex");
var MIGRATION_V15_CHECKSUM = createHash13("sha256").update(CITATION_LOCATOR_SCHEMA).digest("hex");
var MIGRATION_V13_CHECKSUM = createHash13("sha256").update(ZIP_SCHEMA).digest("hex");
var MIGRATION_V14_CHECKSUM = createHash13("sha256").update(CITATION_SCHEMA).digest("hex");
var MIGRATION_V12_CHECKSUM = createHash13("sha256").update(OFFICE_HISTORY_SCHEMA).digest("hex");
var MIGRATION_V11_CHECKSUM = createHash13("sha256").update(OFFICE_AUTH_SCHEMA).digest("hex");
var MIGRATION_V10_CHECKSUM = createHash13("sha256").update(OFFICE_SCHEMA).digest("hex");
var MIGRATION_V9_CHECKSUM = createHash13("sha256").update(TEXT_SCHEMA).digest("hex");
var MIGRATION_V8_CHECKSUM = createHash13("sha256").update(PARSE_SCHEMA).digest("hex");
var MIGRATION_V7_CHECKSUM = createHash13("sha256").update(ASSET_SCHEMA).digest("hex");
var MIGRATION_V6_CHECKSUM = createHash13("sha256").update(JOB_SCHEMA).digest("hex");
var BUSY_TIMEOUT_MS = 250;
var DATABASE_FILENAME = "knowledgeos.sqlite";
var MIGRATION_V1_SQL = `CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
CREATE TABLE storage_probe_records (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
`;
var MIGRATION_V1_CHECKSUM = createHash13("sha256").update(Buffer.from(MIGRATION_V1_SQL, "utf8")).digest("hex");
var MIGRATION_V2_SQL = `CREATE TABLE password_credentials (
  id TEXT PRIMARY KEY,
  algorithm TEXT NOT NULL,
  version INTEGER NOT NULL,
  n INTEGER NOT NULL,
  r INTEGER NOT NULL,
  p INTEGER NOT NULL,
  maxmem INTEGER NOT NULL,
  salt BLOB NOT NULL,
  derived_key BLOB NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  login_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  credential_ref TEXT NOT NULL UNIQUE REFERENCES password_credentials(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  timezone TEXT NOT NULL,
  planning_home_service_id TEXT NOT NULL,
  domains TEXT NOT NULL,
  learning_tracks TEXT NOT NULL,
  goal_text TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE service_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  service_id TEXT NOT NULL UNIQUE,
  bootstrap_admin_user_id TEXT UNIQUE REFERENCES users(id),
  initialized_at TEXT
) STRICT;
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  kind TEXT NOT NULL CHECK (kind = 'personal'),
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
`;
var MIGRATION_V2_CHECKSUM = createHash13("sha256").update(Buffer.from(MIGRATION_V2_SQL, "utf8")).digest("hex");
var MIGRATION_V3_SQL = `CREATE TABLE knowledge_projects (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE project_memberships (
  project_id TEXT NOT NULL REFERENCES knowledge_projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('member', 'owner')),
  valid_from TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  PRIMARY KEY (project_id, user_id)
) STRICT;
CREATE TABLE knowledge_objects (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  space_id TEXT NOT NULL REFERENCES spaces(id),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'project')),
  project_id TEXT REFERENCES knowledge_projects(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  object_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'deleted')),
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((scope_kind = 'personal' AND project_id IS NULL) OR (scope_kind = 'project' AND project_id IS NOT NULL))
) STRICT;
CREATE TABLE resource_grants (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  resource_type TEXT NOT NULL CHECK (resource_type = 'knowledge_object'),
  resource_id TEXT NOT NULL REFERENCES knowledge_objects(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'project')),
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records')),
  valid_from TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (resource_id, subject_type, subject_id, action)
) STRICT;
`;
var MIGRATION_V3_CHECKSUM = createHash13("sha256").update(Buffer.from(MIGRATION_V3_SQL, "utf8")).digest("hex");
var MIGRATION_V4_SQL = `ALTER TABLE resource_grants RENAME TO resource_grants_v3;
CREATE TABLE resource_grants (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  resource_type TEXT NOT NULL CHECK (resource_type = 'knowledge_object'),
  resource_id TEXT NOT NULL REFERENCES knowledge_objects(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'project')),
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records')),
  valid_from TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, revoked_at, created_at)
  SELECT id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, revoked_at, created_at FROM resource_grants_v3;
CREATE UNIQUE INDEX resource_grants_active_subject_action_uq
  ON resource_grants (resource_id, subject_type, subject_id, action)
  WHERE revoked_at IS NULL;
DROP TABLE resource_grants_v3;
`;
var MIGRATION_V4_CHECKSUM = createHash13("sha256").update(Buffer.from(MIGRATION_V4_SQL, "utf8")).digest("hex");
var MIGRATION_V5_SQL = `CREATE TABLE ai_tool_mutations (
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (service_id, user_id, idempotency_key)
) STRICT;
`;
var MIGRATION_V5_CHECKSUM = createHash13("sha256").update(MIGRATION_V5_SQL).digest("hex");
var PROBE_SUPPORTED_TABLES = ["schema_migrations", "storage_probe_records"];
var IDENTITY_SUPPORTED_TABLES = [
  "auth_sessions",
  "knowledge_objects",
  "knowledge_projects",
  "password_credentials",
  "project_memberships",
  "resource_grants",
  "schema_migrations",
  "service_identity",
  "spaces",
  "storage_probe_records",
  "users"
];
var MIGRATION_V1 = { version: 1, sql: MIGRATION_V1_SQL, checksum: MIGRATION_V1_CHECKSUM };
function primarySqliteCode(error) {
  const code = error?.errcode;
  return typeof code === "number" ? code & 255 : void 0;
}
function toRecord(row) {
  return { id: row.id, content: row.content, created_at: row.created_at };
}
function readSchemaObjects(db) {
  return db.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all().filter((object2) => !object2.name.startsWith("sqlite_"));
}
function readDatabaseFacts(path2) {
  const db = new DatabaseSync(path2, { readOnly: true });
  try {
    const applicationId = Number(db.prepare("PRAGMA application_id").get()?.application_id ?? 0);
    const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    const objects = readSchemaObjects(db);
    const tables = objects.filter((object2) => object2.type === "table").map((object2) => object2.name);
    const ledger = tables.includes("schema_migrations") ? db.prepare("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version").all() : [];
    return { applicationId, userVersion, tables, objects, ledger };
  } finally {
    db.close();
  }
}
function rowProfile(row) {
  return {
    id: String(row.id),
    loginName: String(row.login_name),
    displayName: String(row.display_name),
    role: String(row.role),
    status: String(row.status),
    timezone: String(row.timezone),
    planningHomeServiceId: String(row.planning_home_service_id),
    domains: JSON.parse(String(row.domains)),
    learningTracks: JSON.parse(String(row.learning_tracks)),
    goalText: String(row.goal_text),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    personalSpaceId: String(row.personal_space_id)
  };
}
var ProbeStorage = class {
  #dataDir;
  #log;
  #migrationOverride;
  #failureAt;
  #db;
  #state = "unavailable";
  #failure;
  #closed = false;
  #assetTx = (mode, op) => {
    let db;
    try {
      db = this.#ensureReady();
      db.exec(mode === "write" ? "BEGIN IMMEDIATE" : "BEGIN");
    } catch (e) {
      throw new AssetError(503, this.#mapError(e).code);
    }
    try {
      const value = op(db, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("COMMIT");
      return value;
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw e instanceof AssetError ? e : new AssetError(503, this.#mapError(e).code);
    }
  };
  #currentActor(session, now) {
    const ref = this.#ensureReady().prepare("SELECT token_hash FROM auth_sessions WHERE id=? AND user_id=?").get(session.sessionId, session.userId);
    return ref ? this.findActor(String(ref.token_hash), now) : void 0;
  }
  assets = new AssetStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (actor2, id4, action2, now) => Boolean(this.authorizeObject(actor2, id4, action2, now)));
  notes = new NoteStore(
    this.#assetTx,
    (s, now) => this.#currentActor(s, now),
    (a, id4, now) => Boolean(this.authorizeObject(a, id4, "read", now)),
    (a, p, now) => this.canCreateProjectObject(a, p, now),
    (a, p) => this.canManageProject(a, p)
  );
  search = new SearchStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (a, id4, now) => Boolean(this.authorizeObject(a, id4, "read", now)));
  wordSearch = new WordSearchIndex(this.#assetTx);
  archives = new ZipStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (a, id4, now) => Boolean(this.authorizeObject(a, id4, "read", now)));
  citations = new CitationStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (a, id4, now) => Boolean(this.authorizeObject(a, id4, "read", now)), (a, id4, now) => {
    const source = this.authorizeObject(a, id4, "read", now);
    return source && { ...source.projectId ? { project_id: source.projectId } : {}, canComment: Boolean(this.authorizeObject(a, id4, "comment", now)) };
  }, (a, id4, now) => {
    const object2 = this.#loadObject(id4);
    return object2 && this.#authorizationHorizon(a, object2, "read", now);
  });
  recall = new RecallStore(
    this.#assetTx,
    (s, now) => this.#currentActor(s, now),
    (a, id4, now) => Boolean(this.authorizeObject(a, id4, "read", now)),
    (db, a, t, now) => this.citations.recallSource(db, a, t, now)
  );
  invitations = new InvitationStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (db, user, service) => {
    const row = db.prepare(`SELECT p.id FROM users u JOIN spaces p ON p.owner_user_id=u.id AND p.kind='personal'
      WHERE u.id=? AND u.planning_home_service_id=? AND u.status='active' AND p.status='active' AND p.service_id=?`).get(user, service, service);
    return row && { userId: user, serviceId: service, personalSpaceId: String(row.id) };
  }, (a, t, now) => this.#canIssue(a, t, now), (a, p, now) => this.canCreateProjectObject(a, p, now));
  office = new OfficeStore(this.#assetTx, (sessionId, userId, id4, action2, now) => {
    const actor2 = this.#currentActor({ sessionId, userId }, now);
    return !!actor2 && !!this.authorizeObject(actor2, id4, action2, now);
  });
  parses = new ParseStore(this.#assetTx, (sessionId, userId, id4, write, now) => {
    const a = this.#currentActor({ sessionId, userId }, now);
    return Boolean(a && this.authorizeObject(a, id4, "read", now) && (!write || this.authorizeObject(a, id4, "edit", now)));
  });
  jobs = new JobStore((op) => {
    const db = this.#ensureReady();
    try {
      db.exec("BEGIN IMMEDIATE");
    } catch (err) {
      throw this.#mapError(err);
    }
    try {
      const value = op(db, Date.now());
      db.exec("COMMIT");
      return value;
    } catch (err) {
      if (!this.#rollback(db)) throw this.#failure;
      throw err instanceof JobError ? err : this.#mapError(err);
    }
  }, (session, user, object2, ms) => {
    const now = new Date(ms).toISOString();
    const ref = this.#ensureReady().prepare("SELECT token_hash FROM auth_sessions WHERE id=? AND user_id=?").get(session, user);
    const actor2 = ref && this.findActor(String(ref.token_hash), now);
    return actor2 && this.authorizeObject(actor2, object2, "read", now)?.revision;
  }, (point4) => this.#injectFailure(point4));
  constructor(options) {
    this.#dataDir = options.dataDir;
    this.#log = options.log ?? (() => {
    });
    this.#migrationOverride = options.migrationOverride;
    this.#failureAt = options.failureAt;
    this.#open();
  }
  #injectFailure(point4) {
    if (this.#failureAt === point4) throw new Error(`controlled storage failure at ${point4}`);
  }
  get available() {
    return this.#state === "ready";
  }
  get failure() {
    return this.#failure;
  }
  get databasePath() {
    return join(this.#dataDir, DATABASE_FILENAME);
  }
  #open() {
    let db;
    try {
      mkdirSync(this.#dataDir, { recursive: true });
      const path2 = this.databasePath;
      const existing = existsSync(path2) ? this.#precheck(path2) : "blank";
      db = new DatabaseSync(path2);
      this.#configure(db);
      if (existing === "blank") {
        this.#migrateV1(db);
        this.#migrateV2(db);
        this.#migrateV3(db);
        this.#migrateV4(db);
      } else if (existing === "v1") {
        this.#migrateV2(db);
        this.#migrateV3(db);
        this.#migrateV4(db);
      } else if (existing === "v2") {
        this.#migrateV3(db);
        this.#migrateV4(db);
      } else if (existing === "v3") {
        this.#migrateV4(db);
      }
      const priorVersion = existing === "blank" ? 0 : Number(existing.slice(1));
      if (priorVersion < 6) {
        if (existing !== "v5") this.#migrateV5(db);
        this.#migrateV6(db);
      }
      if (priorVersion < 7) this.#migrateV7(db);
      if (priorVersion < 8) this.#migrateV8(db);
      if (priorVersion < 9) this.#migrateV9(db);
      if (priorVersion < 10) this.#migrateV10(db);
      if (priorVersion < 11) this.#migrateV11(db);
      if (priorVersion < 12) this.#migrateV12(db);
      if (priorVersion < 13) this.#migrateV13(db);
      if (priorVersion < 14) this.#migrateV14(db);
      if (priorVersion < 15) this.#migrateV15(db);
      if (priorVersion < 16) this.#migrateV16(db);
      if (priorVersion < 17) this.#migrateV17(db);
      if (priorVersion < 18) this.#migrateV18(db);
      if (priorVersion < 19) this.#migrateV19(db);
      if (priorVersion < 20) this.#migrateV20(db);
      if (priorVersion < 21) this.#migrateV21(db);
      if (priorVersion < 22) this.#migrateV22(db);
      if (priorVersion < 23) this.#migrateV23(db);
      if (priorVersion < 24) this.#migrateV24(db);
      if (priorVersion < 25) this.#migrateV25(db);
      if (priorVersion < 26) this.#migrateV26(db);
      this.#verify(db, SCHEMA_VERSION);
      const facts = readDatabaseFacts(path2);
      const pragmas = this.#readPragmas(db);
      this.#db = db;
      this.#state = "ready";
      this.#log(`knowledgeos-storage: opened node=${process.versions.node} sqlite=${pragmas.sqliteVersion} journal=${pragmas.journalMode} foreign_keys=${pragmas.foreignKeys} synchronous=${pragmas.synchronous} busy_timeout=${pragmas.busyTimeout} tables=${facts.tables.length}`);
    } catch (error) {
      try {
        db?.close();
      } catch {
      }
      this.#failure = error instanceof RecordsError ? error : new RecordsError("STORAGE_UNAVAILABLE", "storage could not be opened", false, { cause: error });
      this.#state = "unavailable";
      this.#log(`knowledgeos-storage: unavailable code=${this.#failure.code}`);
    }
  }
  #precheck(path2) {
    const facts = readDatabaseFacts(path2);
    if (facts.applicationId === 0 && facts.userVersion === 0 && facts.objects.length === 0) return "blank";
    if (facts.applicationId !== APPLICATION_ID) throw new RecordsError("STORAGE_INCOMPATIBLE", "database belongs to another application");
    if (facts.userVersion > SCHEMA_VERSION) throw new RecordsError("STORAGE_INCOMPATIBLE", "database schema is newer than this build");
    if (facts.userVersion === 1) {
      this.#assertV1Schema(facts);
      return "v1";
    }
    if (facts.userVersion === 2) {
      this.#assertV2Schema(facts);
      const db = new DatabaseSync(path2, { readOnly: true });
      try {
        this.#assertV2Definitions(db);
      } finally {
        db.close();
      }
      return "v2";
    }
    if (facts.userVersion === 3) {
      this.#assertV3Schema(facts);
      const db = new DatabaseSync(path2, { readOnly: true });
      try {
        this.#assertV3Definitions(db);
      } finally {
        db.close();
      }
      return "v3";
    }
    if (facts.userVersion === 4) {
      this.#assertV4Schema(facts);
      const db = new DatabaseSync(path2, { readOnly: true });
      try {
        this.#assertV4Definitions(db);
      } finally {
        db.close();
      }
      return "v4";
    }
    if (facts.userVersion === 5) {
      this.#assertV5Schema(facts);
      const db = new DatabaseSync(path2, { readOnly: true });
      try {
        this.#assertV2Definitions(db);
        this.#assertV4Definitions(db);
        this.#assertV5Definitions(db);
      } finally {
        db.close();
      }
      return "v5";
    }
    if (facts.userVersion >= 6 && facts.userVersion <= SCHEMA_VERSION && Number.isInteger(facts.userVersion)) {
      const db = new DatabaseSync(path2, { readOnly: true });
      const version = facts.userVersion;
      try {
        this.#verify(db, version);
      } finally {
        db.close();
      }
      return `v${version}`;
    }
    throw new RecordsError("STORAGE_INCOMPATIBLE", "database schema version is not supported");
  }
  #assertV1Schema(facts) {
    const expected = [...PROBE_SUPPORTED_TABLES].sort();
    const actual = facts.objects.filter((object2) => object2.type === "table").map((object2) => object2.name).sort();
    if (facts.objects.some((object2) => object2.type !== "table") || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v1 schema");
    const entry = facts.ledger[0];
    if (facts.ledger.length !== 1 || entry?.version !== 1 || entry.checksum !== MIGRATION_V1_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v1 migration ledger does not match this build");
  }
  #assertV2Schema(facts) {
    const expected = ["auth_sessions", "password_credentials", "schema_migrations", "service_identity", "spaces", "storage_probe_records", "users"].sort();
    const actual = facts.objects.filter((object2) => object2.type === "table").map((object2) => object2.name).sort();
    if (facts.objects.some((object2) => object2.type !== "table") || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v2 schema");
    const v1 = facts.ledger.find((entry) => entry.version === 1);
    const v2 = facts.ledger.find((entry) => entry.version === 2);
    if (facts.ledger.length !== 2 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v2 migration ledger does not match this build");
  }
  #assertV3Schema(facts) {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort();
    const actual = facts.objects.filter((object2) => object2.type === "table").map((object2) => object2.name).sort();
    if (facts.objects.some((object2) => object2.type !== "table") || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v3 schema");
    const v1 = facts.ledger.find((entry) => entry.version === 1);
    const v2 = facts.ledger.find((entry) => entry.version === 2);
    const v3 = facts.ledger.find((entry) => entry.version === 3);
    if (facts.ledger.length !== 3 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM || v3?.checksum !== MIGRATION_V3_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v3 migration ledger does not match this build");
  }
  #assertV4Schema(facts) {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort();
    const actual = facts.objects.filter((object2) => object2.type === "table").map((object2) => object2.name).sort();
    const unexpected = facts.objects.filter((object2) => object2.type !== "table" && !(object2.type === "index" && object2.name === "resource_grants_active_subject_action_uq"));
    if (unexpected.length !== 0 || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v4 schema");
    const v1 = facts.ledger.find((entry) => entry.version === 1);
    const v2 = facts.ledger.find((entry) => entry.version === 2);
    const v3 = facts.ledger.find((entry) => entry.version === 3);
    const v4 = facts.ledger.find((entry) => entry.version === 4);
    if (facts.ledger.length !== 4 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM || v3?.checksum !== MIGRATION_V3_CHECKSUM || v4?.checksum !== MIGRATION_V4_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v4 migration ledger does not match this build");
  }
  #assertV5Schema(facts) {
    const table = facts.objects.find((item) => item.name === "ai_tool_mutations");
    if (table?.type !== "table" || facts.ledger.length !== 5 || facts.ledger[4]?.checksum !== MIGRATION_V5_CHECKSUM || facts.ledger[4]?.version !== 5) throw new RecordsError("STORAGE_INCOMPATIBLE", "v5 migration ledger/schema does not match this build");
    this.#assertV4Schema({ ...facts, objects: facts.objects.filter((item) => item.name !== "ai_tool_mutations"), ledger: facts.ledger.slice(0, 4) });
  }
  #assertV5Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V5_SQL);
      const sql = (source) => String(source.prepare("SELECT sql FROM sqlite_master WHERE name = 'ai_tool_mutations' AND type = 'table'").get()?.sql ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (sql(db) !== sql(expected)) throw new RecordsError("STORAGE_INCOMPATIBLE", "v5 receipt constraints are not accepted");
    } finally {
      expected.close();
    }
  }
  #assertV2Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V2_SQL);
      const normalize2 = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const signature = (source, table) => {
        const columns2 = source.prepare(`PRAGMA table_info(${table})`).all().map((row) => ({ cid: Number(row.cid), name: String(row.name), type: String(row.type), notnull: Number(row.notnull), pk: Number(row.pk) }));
        const indexes = source.prepare(`PRAGMA index_list(${table})`).all().map((index) => ({
          unique: Number(index.unique),
          origin: String(index.origin),
          columns: source.prepare(`PRAGMA index_info(${JSON.stringify(String(index.name))})`).all().map((row) => ({ seqno: Number(row.seqno), name: row.name === null ? null : String(row.name) }))
        })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const foreignKeys = source.prepare(`PRAGMA foreign_key_list(${table})`).all().map((row) => ({ id: Number(row.id), seq: Number(row.seq), table: String(row.table), from: String(row.from), to: String(row.to), on_update: String(row.on_update), on_delete: String(row.on_delete), match: String(row.match) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const sql = source.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        return { columns: columns2, indexes, foreignKeys, sql: normalize2(sql) };
      };
      for (const table of ["password_credentials", "users", "service_identity", "auth_sessions", "spaces"]) {
        const actual = signature(db, table);
        const expectedSignature = signature(expected, table);
        if (JSON.stringify(actual) !== JSON.stringify(expectedSignature)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v2 table constraints are not accepted: ${table}`);
      }
    } finally {
      expected.close();
    }
  }
  #assertV3Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V2_SQL);
      expected.exec(MIGRATION_V3_SQL);
      const normalize2 = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      for (const table of ["knowledge_projects", "project_memberships", "knowledge_objects", "resource_grants"]) {
        const actualSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        const expectedSql = expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        if (normalize2(actualSql) !== normalize2(expectedSql)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v3 table constraints are not accepted: ${table}`);
      }
    } finally {
      expected.close();
    }
  }
  #assertV4Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V2_SQL);
      expected.exec(MIGRATION_V3_SQL);
      expected.exec(MIGRATION_V4_SQL);
      const normalize2 = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      for (const table of ["knowledge_projects", "project_memberships", "knowledge_objects", "resource_grants"]) {
        const actualSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        const expectedSql = expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        if (normalize2(actualSql) !== normalize2(expectedSql)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v4 table constraints are not accepted: ${table}`);
      }
      const actualIndex = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get();
      const expectedIndex = expected.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get();
      if (actualIndex?.name !== expectedIndex?.name || normalize2(actualIndex?.sql) !== normalize2(expectedIndex?.sql)) throw new RecordsError("STORAGE_INCOMPATIBLE", "v4 active grant uniqueness index is not accepted");
    } finally {
      expected.close();
    }
  }
  #configure(db) {
    const journal = String(db.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode ?? "").toLowerCase();
    if (journal !== "wal") throw new RecordsError("STORAGE_INCOMPATIBLE", "WAL journal mode is not available");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("PRAGMA synchronous=FULL");
    db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
  }
  #readPragmas(db) {
    return {
      journalMode: String(db.prepare("PRAGMA journal_mode").get()?.journal_mode ?? ""),
      foreignKeys: Number(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys ?? 0),
      synchronous: Number(db.prepare("PRAGMA synchronous").get()?.synchronous ?? -1),
      busyTimeout: Number(db.prepare("PRAGMA busy_timeout").get()?.timeout ?? -1),
      sqliteVersion: String(db.prepare("SELECT sqlite_version() AS version").get()?.version ?? "unknown")
    };
  }
  #migrateV1(db) {
    const plan = this.#migrationOverride?.version === 1 ? this.#migrationOverride : MIGRATION_V1;
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(plan.sql);
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(plan.version, plan.checksum, (/* @__PURE__ */ new Date()).toISOString());
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      db.exec("PRAGMA user_version = 1");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed) this.#rollback(db);
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "storage migration failed", false, { cause: error });
    }
  }
  #migrateV2(db) {
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V2_SQL);
      this.#injectFailure("v2:after-schema");
      db.prepare("INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)").run(randomUUID15());
      this.#injectFailure("v2:after-identity");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(2, MIGRATION_V2_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      this.#injectFailure("v2:after-ledger");
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      db.exec("PRAGMA user_version = 2");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed) {
        const rolledBack = this.#rollback(db);
        if (!rolledBack) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      }
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "identity migration failed", false, { cause: error });
    }
  }
  #migrateV3(db) {
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V3_SQL);
      this.#injectFailure("v3:after-projects");
      this.#injectFailure("v3:after-memberships");
      this.#injectFailure("v3:after-objects");
      this.#injectFailure("v3:after-grants");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(3, MIGRATION_V3_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version = 3");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "authorization migration failed", false, { cause: error });
    }
  }
  #migrateV4(db) {
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V4_SQL);
      this.#injectFailure("v4:after-rebuild");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(4, MIGRATION_V4_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version = 4");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "grant history migration failed", false, { cause: error });
    }
  }
  #migrateV5(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V5_SQL);
      this.#injectFailure("v5:after-schema");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(5, MIGRATION_V5_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version = 5");
      db.exec("COMMIT");
    } catch (error) {
      if (!this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw new RecordsError("STORAGE_INCOMPATIBLE", "tool receipt migration failed", false, { cause: error });
    }
  }
  #migrateV6(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(JOB_SCHEMA);
      this.#injectFailure("v6:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(6,?,?)").run(MIGRATION_V6_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=6; COMMIT");
    } catch (err) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "jobs migration failed", false, { cause: err });
    }
  }
  #migrateV7(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(ASSET_SCHEMA);
      this.#injectFailure("v7:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(7,?,?)").run(MIGRATION_V7_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=7; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "asset migration failed", false, { cause: e });
    }
  }
  #migrateV8(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PARSE_SCHEMA);
      this.#injectFailure("v8:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(8,?,?)").run(MIGRATION_V8_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=8; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "parse migration failed", false, { cause: e });
    }
  }
  #migrateV9(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("PRAGMA defer_foreign_keys=ON");
      db.exec(TEXT_SCHEMA);
      this.#injectFailure("v9:after-schema");
      if (db.prepare("PRAGMA foreign_key_check").get()) throw Error("broken reference");
      db.prepare("INSERT INTO schema_migrations VALUES(9,?,?)").run(MIGRATION_V9_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=9; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "text migration failed", false, { cause: e });
    }
  }
  #migrateV10(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("PRAGMA defer_foreign_keys=ON");
      db.exec(OFFICE_SCHEMA);
      this.#injectFailure("v10:after-schema");
      if (db.prepare("PRAGMA foreign_key_check").get()) throw Error("broken reference");
      db.prepare("INSERT INTO schema_migrations VALUES(10,?,?)").run(MIGRATION_V10_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=10; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "office migration failed", false, { cause: e });
    }
  }
  #migrateV11(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(OFFICE_AUTH_SCHEMA);
      this.#injectFailure("v11:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(11,?,?)").run(MIGRATION_V11_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=11; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "office authorization migration failed", false, { cause: e });
    }
  }
  #migrateV12(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(OFFICE_HISTORY_SCHEMA);
      this.#injectFailure("v12:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(12,?,?)").run(MIGRATION_V12_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=12; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "office history index migration failed", false, { cause: e });
    }
  }
  #migrateV13(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(ZIP_SCHEMA);
      this.#injectFailure("v13:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(13,?,?)").run(MIGRATION_V13_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=13; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "ZIP import migration failed", false, { cause: e });
    }
  }
  #migrateV14(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(CITATION_SCHEMA);
      this.#injectFailure("v14:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(14,?,?)").run(MIGRATION_V14_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=14; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "citation migration failed", false, { cause: e });
    }
  }
  #migrateV15(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(CITATION_LOCATOR_SCHEMA);
      this.#injectFailure("v15:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(15,?,?)").run(MIGRATION_V15_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=15; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "citation locator migration failed", false, { cause: e });
    }
  }
  #migrateV16(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(READING_STATE_SCHEMA);
      this.#injectFailure("v16:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(16,?,?)").run(MIGRATION_V16_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=16; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "reading state migration failed", false, { cause: e });
    }
  }
  #migrateV17(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(ANNOTATION_SCHEMA);
      this.#injectFailure("v17:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(17,?,?)").run(MIGRATION_V17_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=17; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "annotation migration failed", false, { cause: e });
    }
  }
  #migrateV18(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(SEARCH_SCHEMA);
      this.#injectFailure("v18:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(18,?,?)").run(MIGRATION_V18_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=18; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "search migration failed", false, { cause: e });
    }
  }
  #migrateV19(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(WORD_SEARCH_SCHEMA);
      this.#injectFailure("v19:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(19,?,?)").run(MIGRATION_V19_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=19; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "Word search migration failed", false, { cause: e });
    }
  }
  #migrateV20(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PDF_CHAPTER_SCHEMA);
      this.#injectFailure("v20:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(20,?,?)").run(MIGRATION_V20_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=20; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "PDF chapter migration failed", false, { cause: e });
    }
  }
  #migrateV21(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(NOTE_SCHEMA);
      this.#injectFailure("v21:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(21,?,?)").run(MIGRATION_V21_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=21; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "independent note migration failed", false, { cause: e });
    }
  }
  #migrateV22(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(RECALL_SCHEMA);
      this.#injectFailure("v22:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(22,?,?)").run(MIGRATION_V22_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=22; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "recall migration failed", false, { cause: e });
    }
  }
  #migrateV23(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(INVITATION_SCHEMA);
      this.#injectFailure("v23:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(23,?,?)").run(MIGRATION_V23_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=23; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "invitation migration failed", false, { cause: e });
    }
  }
  #migrateV24(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(INVITATION_EVENT_SCHEMA);
      this.#injectFailure("v24:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(24,?,?)").run(MIGRATION_V24_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=24; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "invitation event migration failed", false, { cause: e });
    }
  }
  #migrateV25(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(INVITATION_CHANGE_SCHEMA);
      this.#injectFailure("v25:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(25,?,?)").run(MIGRATION_V25_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=25; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "invitation receipt migration failed", false, { cause: e });
    }
  }
  #migrateV26(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(NOTE_OUTLINE_SCHEMA);
      this.#injectFailure("v26:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(26,?,?)").run(MIGRATION_V26_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=26; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "note outline migration failed", false, { cause: e });
    }
  }
  #verify(db, version) {
    const facts = readDatabaseFacts(this.databasePath);
    const checks = [MIGRATION_V6_CHECKSUM, MIGRATION_V7_CHECKSUM, MIGRATION_V8_CHECKSUM, MIGRATION_V9_CHECKSUM, MIGRATION_V10_CHECKSUM, MIGRATION_V11_CHECKSUM, MIGRATION_V12_CHECKSUM, MIGRATION_V13_CHECKSUM, MIGRATION_V14_CHECKSUM, MIGRATION_V15_CHECKSUM, MIGRATION_V16_CHECKSUM, MIGRATION_V17_CHECKSUM, MIGRATION_V18_CHECKSUM, MIGRATION_V19_CHECKSUM, MIGRATION_V20_CHECKSUM, MIGRATION_V21_CHECKSUM, MIGRATION_V22_CHECKSUM, MIGRATION_V23_CHECKSUM, MIGRATION_V24_CHECKSUM, MIGRATION_V25_CHECKSUM, MIGRATION_V26_CHECKSUM].slice(0, version - 5);
    if (facts.applicationId !== APPLICATION_ID || facts.userVersion !== version || facts.ledger.length !== version || checks.some((hash4, i) => facts.ledger[i + 5]?.version !== i + 6 || facts.ledger[i + 5]?.checksum !== hash4)) throw new RecordsError("STORAGE_INCOMPATIBLE", "database ownership/version verification failed");
    const reference = new DatabaseSync(":memory:");
    try {
      reference.exec(JOB_SCHEMA);
      if (version >= 7) reference.exec(ASSET_SCHEMA);
      if (version >= 8) reference.exec(PARSE_SCHEMA);
      if (version >= 9) reference.exec(TEXT_SCHEMA);
      if (version >= 10) reference.exec(OFFICE_SCHEMA);
      if (version >= 11) reference.exec(OFFICE_AUTH_SCHEMA);
      if (version >= 12) reference.exec(OFFICE_HISTORY_SCHEMA);
      if (version >= 13) reference.exec(ZIP_SCHEMA);
      if (version >= 14) reference.exec(CITATION_SCHEMA);
      if (version >= 15) reference.exec(CITATION_LOCATOR_SCHEMA);
      if (version >= 16) reference.exec(READING_STATE_SCHEMA);
      if (version >= 17) reference.exec(ANNOTATION_SCHEMA);
      if (version >= 18) reference.exec(SEARCH_SCHEMA);
      if (version >= 19) reference.exec(WORD_SEARCH_SCHEMA);
      if (version >= 20) reference.exec(PDF_CHAPTER_SCHEMA);
      if (version >= 21) reference.exec(NOTE_SCHEMA);
      if (version >= 22) reference.exec(RECALL_SCHEMA);
      if (version >= 23) reference.exec(INVITATION_SCHEMA);
      if (version >= 24) reference.exec(INVITATION_EVENT_SCHEMA);
      if (version >= 25) reference.exec(INVITATION_CHANGE_SCHEMA);
      if (version >= 26) reference.exec(NOTE_OUTLINE_SCHEMA);
      const definitions = reference.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
      for (const { name: name2, sql } of definitions) {
        if (db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(name2)?.sql !== sql) throw new RecordsError("STORAGE_INCOMPATIBLE", "jobs schema definition mismatch");
      }
      const names = new Set(definitions.map((x) => x.name));
      this.#assertV5Schema({ ...facts, ledger: facts.ledger.slice(0, 5), objects: facts.objects.filter((x) => !names.has(x.name)) });
    } finally {
      reference.close();
    }
    this.#assertV2Definitions(db);
    this.#assertV4Definitions(db);
    this.#assertV5Definitions(db);
    const identity = db.prepare("SELECT id, service_id, bootstrap_admin_user_id, initialized_at FROM service_identity").all();
    if (identity.length !== 1 || Number(identity[0]?.id) !== 1 || typeof identity[0]?.service_id !== "string") throw new RecordsError("STORAGE_INCOMPATIBLE", "service identity is not a singleton");
  }
  #rollback(db) {
    try {
      db.exec("ROLLBACK");
      return true;
    } catch (error) {
      this.#state = "unavailable";
      this.#failure = new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      return false;
    }
  }
  #ensureReady() {
    if (this.#state === "closed") throw new RecordsError("STORAGE_CLOSED", "storage is closed");
    if (this.#state !== "ready" || this.#db === void 0) throw this.#failure ?? new RecordsError("STORAGE_UNAVAILABLE", "storage is unavailable");
    return this.#db;
  }
  #mapError(error) {
    if (error instanceof RecordsError) return error;
    const primary = primarySqliteCode(error);
    if (primary === 5) return new RecordsError("STORAGE_BUSY", "storage is busy", true, { cause: error });
    if (primary === 8 || primary === 14) return new RecordsError("STORAGE_UNAVAILABLE", "storage is not writable", false, { cause: error });
    return new RecordsError("STORAGE_UNAVAILABLE", "storage operation failed", false, { cause: error });
  }
  #selectByKey(db, key) {
    return db.prepare("SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE idempotency_key = ?").get(key);
  }
  createOrReplay(input) {
    const db = this.#ensureReady();
    let inTransaction = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const existing = this.#selectByKey(db, input.idempotencyKey);
      if (existing !== void 0) {
        if (existing.request_digest === input.digest && existing.content === input.content) {
          db.exec("COMMIT");
          inTransaction = false;
          return { kind: "replayed", record: toRecord(existing) };
        }
        db.exec("ROLLBACK");
        inTransaction = false;
        return { kind: "conflict" };
      }
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.id, input.idempotencyKey, input.digest, input.content, input.createdAt);
      db.exec("COMMIT");
      inTransaction = false;
      return { kind: "created", record: { id: input.id, content: input.content, created_at: input.createdAt } };
    } catch (error) {
      if (inTransaction && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      if (primarySqliteCode(error) === 19) {
        const raced = this.#selectByKey(db, input.idempotencyKey);
        if (raced !== void 0) return raced.request_digest === input.digest && raced.content === input.content ? { kind: "replayed", record: toRecord(raced) } : { kind: "conflict" };
      }
      throw this.#mapError(error);
    }
  }
  getById(id4) {
    const db = this.#ensureReady();
    try {
      const row = db.prepare("SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE id = ?").get(id4);
      return row === void 0 ? void 0 : toRecord(row);
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  getSetupState() {
    const db = this.#ensureReady();
    const row = db.prepare("SELECT service_id, bootstrap_admin_user_id, initialized_at FROM service_identity WHERE id = 1").get();
    return { serviceId: String(row.service_id), initialized: row.initialized_at !== null && row.initialized_at !== void 0, initializedAt: row.initialized_at === null || row.initialized_at === void 0 ? void 0 : String(row.initialized_at), bootstrapAdminUserId: row.bootstrap_admin_user_id === null || row.bootstrap_admin_user_id === void 0 ? void 0 : String(row.bootstrap_admin_user_id) };
  }
  #profileByUser(db, userId) {
    const row = db.prepare(`SELECT u.*, s.id AS personal_space_id FROM users u JOIN spaces s ON s.owner_user_id = u.id AND s.kind = 'personal' WHERE u.id = ?`).get(userId);
    return row === void 0 ? void 0 : rowProfile(row);
  }
  bootstrap(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      const state = db.prepare("SELECT service_id, initialized_at FROM service_identity WHERE id = 1").get();
      if (state.initialized_at !== null && state.initialized_at !== void 0) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "already_initialized" };
      }
      const serviceId = String(state.service_id);
      const now = input.now;
      const userId = randomUUID15();
      const spaceId = randomUUID15();
      const credentialId = randomUUID15();
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(credentialId, input.credential.algorithm, input.credential.version, input.credential.n, input.credential.r, input.credential.p, input.credential.maxmem, input.credential.salt, input.credential.derivedKey, now);
      this.#injectFailure("bootstrap:after-credential");
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`).run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now);
      this.#injectFailure("bootstrap:after-user");
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now);
      this.#injectFailure("bootstrap:after-space");
      db.prepare("UPDATE service_identity SET bootstrap_admin_user_id = ?, initialized_at = ? WHERE id = 1 AND initialized_at IS NULL").run(userId, now);
      this.#injectFailure("bootstrap:after-identity");
      db.exec("COMMIT");
      tx = false;
      const user = this.#profileByUser(db, userId);
      if (user === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "created administrator could not be read");
      return { kind: "created", user };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      if (primarySqliteCode(error) === 19) return { kind: "already_initialized" };
      throw this.#mapError(error);
    }
  }
  register(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      const state = db.prepare("SELECT service_id, initialized_at FROM service_identity WHERE id = 1").get();
      if (state.initialized_at === null || state.initialized_at === void 0) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "setup_required" };
      }
      const serviceId = String(state.service_id);
      const now = input.now;
      const userId = randomUUID15();
      const spaceId = randomUUID15();
      const credentialId = randomUUID15();
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(credentialId, input.credential.algorithm, input.credential.version, input.credential.n, input.credential.r, input.credential.p, input.credential.maxmem, input.credential.salt, input.credential.derivedKey, now);
      this.#injectFailure("register:after-credential");
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`).run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now);
      this.#injectFailure("register:after-user");
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now);
      this.#injectFailure("register:after-space");
      db.exec("COMMIT");
      tx = false;
      const user = this.#profileByUser(db, userId);
      if (user === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "created user could not be read");
      return { kind: "created", user };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      if (primarySqliteCode(error) === 19) {
        const exists = db.prepare("SELECT 1 AS value FROM users WHERE login_name = ?").get(input.loginName);
        if (exists !== void 0) return { kind: "login_name_taken" };
      }
      throw this.#mapError(error);
    }
  }
  findLogin(loginName) {
    const db = this.#ensureReady();
    const row = db.prepare(`SELECT u.id, u.login_name, u.status, u.role, u.timezone, u.display_name, u.credential_ref, c.algorithm, c.version, c.n, c.r, c.p, c.maxmem, c.salt, c.derived_key FROM users u JOIN password_credentials c ON c.id = u.credential_ref WHERE u.login_name = ?`).get(loginName);
    if (row === void 0) return void 0;
    return { userId: String(row.id), loginName: String(row.login_name), displayName: String(row.display_name), role: String(row.role), status: String(row.status), timezone: String(row.timezone), credential: { algorithm: String(row.algorithm), version: Number(row.version), n: Number(row.n), r: Number(row.r), p: Number(row.p), maxmem: Number(row.maxmem), salt: Buffer.from(row.salt), derivedKey: Buffer.from(row.derived_key) } };
  }
  createSession(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      if (input.revokeTokenHash !== void 0) db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?").run(input.createdAt, input.revokeTokenHash, input.createdAt);
      db.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)").run(input.sessionId, input.userId, input.tokenHash, input.createdAt, input.expiresAt);
      db.exec("COMMIT");
      tx = false;
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  findActor(tokenHash2, now) {
    const db = this.#ensureReady();
    const row = db.prepare(`SELECT s.id AS session_id, u.id AS user_id, u.role, u.status, u.planning_home_service_id AS service_id, p.id AS personal_space_id FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN spaces p ON p.owner_user_id = u.id AND p.kind = 'personal' WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active' AND p.status = 'active'`).get(tokenHash2, now);
    if (row === void 0) return void 0;
    return { sessionId: String(row.session_id), userId: String(row.user_id), role: String(row.role), serviceId: String(row.service_id), personalSpaceId: String(row.personal_space_id) };
  }
  revokeSession(tokenHash2, now) {
    const db = this.#ensureReady();
    const result = db.prepare("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?").run(now, tokenHash2);
    return Number(result.changes) > 0;
  }
  getProfile(userId) {
    return this.#profileByUser(this.#ensureReady(), userId);
  }
  getSpaces(userId) {
    const db = this.#ensureReady();
    return db.prepare(`SELECT id, service_id, kind, owner_user_id, status, revision, created_at, updated_at FROM spaces WHERE owner_user_id = ? AND kind = 'personal' AND status = 'active'`).all(userId).map((row) => ({ id: String(row.id), serviceId: String(row.service_id), kind: "personal", ownerUserId: String(row.owner_user_id), status: String(row.status), revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }
  updatePreferences(userId, expectedRevision, patch, now) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      const current = this.#profileByUser(db, userId);
      if (current === void 0) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "conflict" };
      }
      const next = { ...current, ...patch, revision: current.revision + 1, updatedAt: now };
      const result = db.prepare("UPDATE users SET display_name = ?, timezone = ?, domains = ?, learning_tracks = ?, goal_text = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(next.displayName, next.timezone, JSON.stringify(next.domains), JSON.stringify(next.learningTracks), next.goalText, next.revision, now, userId, expectedRevision);
      if (Number(result.changes) !== 1) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "conflict", user: this.#profileByUser(db, userId) };
      }
      db.exec("COMMIT");
      tx = false;
      const updated = this.#profileByUser(db, userId);
      if (updated === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "updated user could not be read");
      return { kind: "updated", user: updated };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  #objectRow(row) {
    return { id: String(row.id), serviceId: String(row.service_id), spaceId: String(row.space_id), scope: String(row.scope_kind), projectId: row.project_id == null ? void 0 : String(row.project_id), ownerUserId: String(row.owner_user_id), objectType: String(row.object_type), title: String(row.title), body: String(row.body), status: String(row.status), revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
  #objectTarget(row) {
    return { serviceId: row.serviceId, spaceId: row.spaceId, objectId: row.id, scope: row.scope, ownerUserId: row.ownerUserId, projectId: row.projectId, status: row.status };
  }
  #grants(db, objectId) {
    return db.prepare("SELECT subject_type, subject_id, action, valid_from, expires_at, revoked_at FROM resource_grants WHERE resource_type = 'knowledge_object' AND resource_id = ?").all(objectId).map((row) => ({ subjectType: String(row.subject_type), subjectId: String(row.subject_id), action: String(row.action), validFrom: String(row.valid_from), expiresAt: row.expires_at == null ? void 0 : String(row.expires_at), revokedAt: row.revoked_at == null ? void 0 : String(row.revoked_at) }));
  }
  #memberships(db, projectId) {
    return db.prepare(`SELECT project_id,user_id,role,valid_from,expires_at,revoked_at FROM project_memberships WHERE project_id=?
      UNION ALL SELECT i.project_id,r.user_id,'member',r.redeemed_at,r.expires_at,r.revoked_at
      FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id
      JOIN knowledge_projects p ON p.id=i.project_id AND p.service_id=i.service_id AND p.status='active'
      WHERE i.project_id=? AND i.permission='member' AND i.revoked_at IS NULL AND r.expires_at=i.expires_at`).all(projectId, projectId).map((row) => ({ projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), validFrom: String(row.valid_from), expiresAt: row.expires_at == null ? void 0 : String(row.expires_at), revokedAt: row.revoked_at == null ? void 0 : String(row.revoked_at) }));
  }
  #invitedActions(db, actor2, object2, action2, now) {
    if (action2 !== "read" && action2 !== "edit" || object2.objectType !== "asset") return [];
    return db.prepare(`SELECT r.redeemed_at,r.expires_at FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id
      WHERE i.object_id=? AND i.service_id=? AND r.user_id=? AND r.revoked_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at=r.expires_at AND r.expires_at>? AND (i.permission='edit' OR i.permission=?)`).all(object2.id, actor2.serviceId, actor2.userId, now, action2).map((r) => ({ subjectType: "user", subjectId: actor2.userId, action: action2, validFrom: String(r.redeemed_at), expiresAt: String(r.expires_at) }));
  }
  #canIssue(actor2, t, now) {
    if (t.scope === "project") {
      if (t.permission !== "member" || !this.canManageProject(actor2, t.id)) return;
      const row = this.#ensureReady().prepare("SELECT name FROM knowledge_projects WHERE id=?").get(t.id);
      return row && { title: String(row.name) };
    }
    if (t.permission !== "read" && t.permission !== "edit") return;
    const object2 = this.authorizeObject(actor2, t.id, "manage_share", now);
    if (object2?.objectType !== "asset" || !this.authorizeObject(actor2, t.id, "read", now) || t.permission === "edit" && !this.authorizeObject(actor2, t.id, "edit", now)) return;
    return { title: object2.title, project_id: object2.projectId };
  }
  #loadObject(id4) {
    const row = this.#ensureReady().prepare("SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE id = ?").get(id4);
    return row === void 0 ? void 0 : this.#objectRow(row);
  }
  #authorizationHorizon(actor2, object2, action2, now) {
    const db = this.#ensureReady();
    return authorizationHorizon(
      actor2,
      this.#objectTarget(object2),
      action2,
      now,
      this.#grants(db, object2.id),
      object2.projectId === void 0 ? [] : this.#memberships(db, object2.projectId),
      this.#invitedActions(db, actor2, object2, action2, now)
    );
  }
  authorizeObject(actor2, objectId, action2, now) {
    const object2 = this.#loadObject(objectId);
    return object2 && this.#authorizationHorizon(actor2, object2, action2, now) !== void 0 ? object2 : void 0;
  }
  listObjects(actor2, action2, now) {
    const db = this.#ensureReady();
    const rows = db.prepare("SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE service_id = ? AND status = 'active' ORDER BY created_at, id").all(actor2.serviceId);
    return rows.map((row) => this.#objectRow(row)).filter((object2) => authorize(actor2, this.#objectTarget(object2), action2, now, this.#grants(db, object2.id), object2.projectId === void 0 ? [] : this.#memberships(db, object2.projectId), this.#invitedActions(db, actor2, object2, action2, now)));
  }
  createProject(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      db.prepare("INSERT INTO knowledge_projects (id, service_id, owner_user_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(input.id, input.serviceId, input.ownerUserId, input.name, input.now, input.now);
      db.prepare("INSERT INTO project_memberships (project_id, user_id, role, valid_from) VALUES (?, ?, 'owner', ?)").run(input.id, input.ownerUserId, input.now);
      db.exec("COMMIT");
      tx = false;
      return { id: input.id, serviceId: input.serviceId, ownerUserId: input.ownerUserId, name: input.name, status: "active", createdAt: input.now, updatedAt: input.now };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  canManageProject(actor2, projectId) {
    const row = this.#ensureReady().prepare("SELECT service_id, owner_user_id, status FROM knowledge_projects WHERE id = ?").get(projectId);
    return row !== void 0 && String(row.service_id) === actor2.serviceId && String(row.owner_user_id) === actor2.userId && String(row.status) === "active";
  }
  ownedProjects(actor2) {
    return this.#ensureReady().prepare("SELECT id,name AS title FROM knowledge_projects WHERE service_id=? AND owner_user_id=? AND status='active' ORDER BY created_at DESC,id LIMIT 200").all(actor2.serviceId, actor2.userId);
  }
  canCreateProjectObject(actor2, projectId, now) {
    const db = this.#ensureReady();
    const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(projectId);
    if (project === void 0 || String(project.service_id) !== actor2.serviceId || String(project.status) !== "active") return false;
    return this.#memberships(db, projectId).some((item) => item.userId === actor2.userId && isGrantActive(item, now));
  }
  addProjectMembership(input) {
    const db = this.#ensureReady();
    try {
      db.prepare("INSERT INTO project_memberships (project_id, user_id, role, valid_from, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, valid_from = excluded.valid_from, expires_at = excluded.expires_at, revoked_at = NULL").run(input.projectId, input.userId, input.role, input.validFrom, input.expiresAt ?? null);
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  createObject(input) {
    const db = this.#ensureReady();
    if (input.scope === "personal" && input.projectId !== void 0) throw new RecordsError("STORAGE_INCOMPATIBLE", "personal object cannot reference a project");
    if (input.scope === "project") {
      if (input.projectId === void 0) throw new RecordsError("STORAGE_INCOMPATIBLE", "project object requires a project");
      const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(input.projectId);
      if (project === void 0 || String(project.service_id) !== input.serviceId || String(project.status) !== "active" || !this.#memberships(db, input.projectId).some((item) => item.userId === input.ownerUserId && isGrantActive(item, input.now))) throw new RecordsError("STORAGE_INCOMPATIBLE", "object owner is not an active project member");
    }
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      db.prepare("INSERT INTO knowledge_objects (id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)").run(input.id, input.serviceId, input.spaceId, input.scope, input.projectId ?? null, input.ownerUserId, input.objectType, input.title, input.body, input.now, input.now);
      if (input.scope === "project" && input.projectId !== void 0) {
        for (const action2 of ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"]) db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, created_at) VALUES (?, ?, 'knowledge_object', ?, 'user', ?, ?, ?, ?)").run(randomUUID15(), input.serviceId, input.id, input.ownerUserId, action2, input.now, input.now);
      }
      ;
      db.exec("COMMIT");
      tx = false;
      const created = this.#loadObject(input.id);
      if (created === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "created object could not be read");
      return created;
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  updateObject(prior, objectId, expectedRevision, patch) {
    try {
      return this.#assetTx("write", (db, now) => {
        const actor2 = this.#currentActor(prior, now);
        if (!actor2) return { kind: "session_expired" };
        const current = this.authorizeObject(actor2, objectId, "edit", now);
        if (!current) return { kind: "not_found" };
        if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision };
        const updated = db.prepare(`UPDATE knowledge_objects SET title=?,body=?,revision=revision+1,updated_at=?
          WHERE id=? AND revision=? AND status='active' RETURNING *`).get(patch.title ?? current.title, patch.body ?? current.body, now, objectId, expectedRevision);
        if (!updated) throw new RecordsError("STORAGE_UNAVAILABLE", "locked object update did not write a row");
        return { kind: "updated", object: this.#objectRow(updated) };
      });
    } catch (e) {
      throw this.#mapError(e);
    }
  }
  /** Revalidate the original login inside the same transaction as ACL/version/receipt. */
  mutateObjectOnce(actor2, input, now) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      now = (/* @__PURE__ */ new Date()).toISOString();
      const session = db.prepare(`SELECT s.id FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN spaces p ON p.owner_user_id = u.id WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active' AND p.status = 'active' AND p.id = ? AND u.planning_home_service_id = ?`).get(actor2.sessionId, actor2.userId, now, actor2.personalSpaceId, actor2.serviceId);
      const finish = (value) => {
        db.exec("COMMIT");
        tx = false;
        return value;
      };
      if (session === void 0) return finish({ kind: "session_expired" });
      const current = this.authorizeObject(actor2, input.objectId, "edit", now);
      if (current === void 0 || this.authorizeObject(actor2, input.objectId, "read", now) === void 0) return finish({ kind: "not_found" });
      const receipt3 = db.prepare("SELECT request_digest, result_json FROM ai_tool_mutations WHERE service_id = ? AND user_id = ? AND idempotency_key = ?").get(actor2.serviceId, actor2.userId, input.key);
      if (receipt3 !== void 0) return finish(receipt3.request_digest === input.digest ? { kind: "replayed", object: JSON.parse(receipt3.result_json) } : { kind: "idempotency_conflict" });
      if (current.revision !== input.expectedRevision) return finish({ kind: "conflict" });
      const changed2 = db.prepare("UPDATE knowledge_objects SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'active'").run(input.title ?? current.title, input.body ?? current.body, now, input.objectId, input.expectedRevision);
      if (Number(changed2.changes) !== 1) return finish({ kind: "conflict" });
      this.#injectFailure("ai:after-update");
      const object2 = this.#loadObject(input.objectId);
      db.prepare("INSERT INTO ai_tool_mutations (service_id, user_id, idempotency_key, request_digest, object_id, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(actor2.serviceId, actor2.userId, input.key, input.digest, input.objectId, JSON.stringify(object2), now);
      return finish({ kind: "updated", object: object2 });
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  deleteObject(actor2, objectId, now) {
    const object2 = this.authorizeObject(actor2, objectId, "delete", now);
    if (object2 === void 0) return false;
    const result = this.#ensureReady().prepare("UPDATE knowledge_objects SET status = 'deleted', revision = revision + 1, updated_at = ? WHERE id = ? AND status = 'active'").run(now, objectId);
    return Number(result.changes) === 1;
  }
  grantObject(actor2, input) {
    const db = this.#ensureReady();
    const object2 = this.authorizeObject(actor2, input.objectId, "manage_share", input.now);
    if (object2 === void 0 || input.serviceId !== actor2.serviceId) return void 0;
    if (input.subjectType === "project") {
      const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(input.subjectId);
      if (project === void 0 || String(project.service_id) !== actor2.serviceId || String(project.status) !== "active") return void 0;
    } else {
      const user = db.prepare("SELECT planning_home_service_id, status FROM users WHERE id = ?").get(input.subjectId);
      if (user === void 0 || String(user.planning_home_service_id) !== actor2.serviceId || String(user.status) !== "active") return void 0;
    }
    try {
      db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, created_at) VALUES (?, ?, 'knowledge_object', ?, ?, ?, ?, ?, ?, ?)").run(input.id, input.serviceId, input.objectId, input.subjectType, input.subjectId, input.action, input.validFrom, input.expiresAt ?? null, input.now);
      return { id: input.id, serviceId: input.serviceId, resourceType: "knowledge_object", resourceId: input.objectId, subjectType: input.subjectType, subjectId: input.subjectId, action: input.action, validFrom: input.validFrom, expiresAt: input.expiresAt, createdAt: input.now };
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  revokeGrant(actor2, grantId, now) {
    const db = this.#ensureReady();
    const grant = db.prepare("SELECT resource_id, service_id, revoked_at FROM resource_grants WHERE id = ?").get(grantId);
    if (grant?.resource_id === void 0 || grant.service_id !== actor2.serviceId || grant.revoked_at !== null || this.authorizeObject(actor2, String(grant.resource_id), "manage_share", now) === void 0) return false;
    const result = db.prepare("UPDATE resource_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now, grantId);
    return Number(result.changes) === 1;
  }
  /** Test-only transaction probe for FND-003 rollback evidence. */
  testOnlyTransactionFailure(input) {
    const db = this.#ensureReady();
    db.exec("BEGIN IMMEDIATE");
    let primaryCode;
    let failed = false;
    try {
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.firstKey, createHash13("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.failingKey, createHash13("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
    } catch (error) {
      failed = true;
      primaryCode = primarySqliteCode(error);
      if (!this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
    }
    if (!failed) {
      this.#rollback(db);
      throw new RecordsError("INTERNAL_ERROR", "transaction probe did not fail");
    }
    const rows = Number(db.prepare("SELECT count(*) AS count FROM storage_probe_records WHERE id IN (?, ?)").get(input.firstId, input.failingId).count);
    return { rolledBack: primaryCode === 19, primaryCode, rows };
  }
  /** Test-only identity transaction probe; never reachable from HTTP/config. */
  testOnlyIdentityTransactionFailure(input) {
    const db = this.#ensureReady();
    let primaryCode;
    let failed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      const state = db.prepare("SELECT service_id FROM service_identity WHERE id = 1").get();
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.credentialId, "scrypt", 1, 131072, 8, 1, 192 * 1024 * 1024, Buffer.alloc(16, 1), Buffer.alloc(32, 2), input.now);
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, '[]', '[]', '', 1, ?, ?)`).run(input.userId, input.loginName, "fixture", input.credentialId, "Asia/Shanghai", state.service_id, input.now, input.now);
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.duplicateCredentialId, "scrypt", 1, 131072, 8, 1, 192 * 1024 * 1024, Buffer.alloc(16, 3), Buffer.alloc(32, 4), input.now);
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, '[]', '[]', '', 1, ?, ?)`).run(input.duplicateUserId, input.loginName, "duplicate", input.duplicateCredentialId, "Asia/Shanghai", state.service_id, input.now, input.now);
    } catch (error) {
      failed = true;
      primaryCode = primarySqliteCode(error);
      if (!this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
    }
    if (!failed) {
      this.#rollback(db);
      throw new RecordsError("INTERNAL_ERROR", "identity transaction probe did not fail");
    }
    const users = Number(db.prepare("SELECT count(*) AS count FROM users WHERE id IN (?, ?)").get(input.userId, input.duplicateUserId).count);
    const credentials = Number(db.prepare("SELECT count(*) AS count FROM password_credentials WHERE id IN (?, ?)").get(input.credentialId, input.duplicateCredentialId).count);
    const spaces = Number(db.prepare("SELECT count(*) AS count FROM spaces WHERE owner_user_id IN (?, ?)").get(input.userId, input.duplicateUserId).count);
    const identity = db.prepare("SELECT initialized_at FROM service_identity WHERE id = 1").get();
    return { rolledBack: primaryCode === 19, primaryCode, users, credentials, spaces, initialized: identity.initialized_at !== null };
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#state = "closed";
    const db = this.#db;
    this.#db = void 0;
    if (db !== void 0) {
      try {
        db.close();
        this.#log("knowledgeos-storage: closed");
      } catch (error) {
        this.#log(`knowledgeos-storage: close failed code=${this.#mapError(error).code}`);
      }
    }
  }
};

// src/host/identity.ts
import { createHash as createHash14, randomBytes as randomBytes2, randomUUID as randomUUID16, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
var DOMAINS = ["software_engineering", "system_architecture", "hardware_engineering", "ai_development"];
var LEARNING_TRACKS = ["engineering_practice", "architecture_exam", "knowledge_accumulation"];
var DEFAULT_TIMEZONE = "Asia/Shanghai";
var SESSION_TTL_MS = 12 * 60 * 60 * 1e3;
var MAX_REQUEST_BODY_BYTES2 = 16 * 1024;
var KDF_CONFIG = {
  algorithm: "scrypt",
  version: 1,
  n: 131072,
  r: 8,
  p: 1,
  maxmem: 192 * 1024 * 1024,
  keyLen: 32,
  saltBytes: 16
};
var IdentityError = class extends Error {
  constructor(code, message, retryable = false, retryAfterMs) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.name = "IdentityError";
  }
};
function normalizeLoginName(value) {
  return value.trim().toLowerCase();
}
function validateLoginName(value) {
  if (typeof value !== "string") throw new IdentityError("INPUT_INVALID", "login_name must be a string");
  const normalized = normalizeLoginName(value);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) throw new IdentityError("INPUT_INVALID", "login_name must be 3-64 ASCII characters");
  return normalized;
}
function validateDisplayName(value) {
  if (typeof value !== "string" || !value.isWellFormed()) throw new IdentityError("INPUT_INVALID", "display_name is invalid");
  const count = [...value].length;
  if (count < 1 || count > 80 || Buffer.byteLength(value, "utf8") > 320) throw new IdentityError("INPUT_INVALID", "display_name length is invalid");
  return value;
}
function validatePassword(value) {
  if (typeof value !== "string" || !value.isWellFormed()) throw new IdentityError("INPUT_INVALID", "password is invalid");
  const count = [...value].length;
  if (count < 15 || count > 128 || Buffer.byteLength(value, "utf8") > 512) throw new IdentityError("INPUT_INVALID", "password length is invalid");
  return value;
}
function validateTimezone(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) throw new IdentityError("INPUT_INVALID", "timezone is invalid");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new IdentityError("INPUT_INVALID", "timezone is invalid");
  }
  return value;
}
function validateEnumList(value, allowed, label) {
  if (!Array.isArray(value) || value.length > allowed.length || value.some((item) => typeof item !== "string" || !allowed.includes(item))) throw new IdentityError("INPUT_INVALID", `${label} is invalid`);
  const unique = [...new Set(value)];
  if (unique.length !== value.length) throw new IdentityError("INPUT_INVALID", `${label} contains duplicates`);
  return unique;
}
function validateDomains(value) {
  return validateEnumList(value, DOMAINS, "domains");
}
function validateLearningTracks(value) {
  return validateEnumList(value, LEARNING_TRACKS, "learning_tracks");
}
function validateGoalText(value) {
  if (typeof value !== "string" || !value.isWellFormed() || Buffer.byteLength(value, "utf8") > 2e3) throw new IdentityError("INPUT_INVALID", "goal_text is invalid");
  return value;
}
function validateExpectedRevision(value) {
  if (!Number.isInteger(value) || Number(value) < 1) throw new IdentityError("INPUT_INVALID", "expected_revision is invalid");
  return Number(value);
}
function tokenHash(token2) {
  return createHash14("sha256").update(token2, "utf8").digest("hex");
}
function makeToken() {
  return randomBytes2(32).toString("base64url");
}
var KdfScheduler = class {
  #maxRunning = 2;
  #maxQueued = 8;
  #running = 0;
  #peakRunning = 0;
  #started = 0;
  #completed = 0;
  #queuedCancelled = 0;
  #queue = [];
  #closing = false;
  get running() {
    return this.#running;
  }
  get queued() {
    return this.#queue.length;
  }
  get peakRunning() {
    return this.#peakRunning;
  }
  get started() {
    return this.#started;
  }
  get completed() {
    return this.#completed;
  }
  get queuedCancelled() {
    return this.#queuedCancelled;
  }
  async derive(password, salt, signal) {
    if (this.#closing) throw new IdentityError("STORAGE_UNAVAILABLE", "password service is closing", true);
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (this.#running >= this.#maxRunning && this.#queue.length >= this.#maxQueued) throw new IdentityError("AUTH_RATE_LIMITED", "authentication work is busy", true);
    if (this.#running < this.#maxRunning) return await this.#start(password, salt, signal);
    return await new Promise((resolve2, reject2) => {
      const item = { password, salt, signal, resolve: resolve2, reject: reject2 };
      this.#queue.push(item);
      const onAbort = () => {
        const index = this.#queue.indexOf(item);
        if (index !== -1) {
          this.#queue.splice(index, 1);
          this.#queuedCancelled += 1;
          reject2(new DOMException("aborted", "AbortError"));
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  async #start(password, salt, signal) {
    this.#running += 1;
    this.#peakRunning = Math.max(this.#peakRunning, this.#running);
    this.#started += 1;
    try {
      return await new Promise((resolve2, reject2) => {
        nodeScrypt(password, salt, KDF_CONFIG.keyLen, { N: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem }, (error, derived) => {
          if (error) reject2(error);
          else {
            this.#completed += 1;
            resolve2(derived);
          }
        });
      });
    } finally {
      this.#running -= 1;
      const next = this.#queue.shift();
      if (next !== void 0) {
        if (next.signal?.aborted) next.reject(new DOMException("aborted", "AbortError"));
        else void this.#start(next.password, next.salt, next.signal).then(next.resolve, next.reject);
      }
    }
  }
  async close() {
    this.#closing = true;
    for (const item of this.#queue.splice(0)) item.reject(new DOMException("aborted", "AbortError"));
    while (this.#running > 0) await new Promise((resolve2) => setTimeout(resolve2, 5));
  }
};
async function derivePassword(scheduler, password, signal) {
  const salt = randomBytes2(KDF_CONFIG.saltBytes);
  const derivedKey = await scheduler.derive(password, salt, signal);
  return { algorithm: KDF_CONFIG.algorithm, version: KDF_CONFIG.version, n: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem, salt, derivedKey };
}
async function verifyPassword(scheduler, password, credential, signal) {
  if (credential.algorithm !== KDF_CONFIG.algorithm || credential.version !== KDF_CONFIG.version || credential.n !== KDF_CONFIG.n || credential.r !== KDF_CONFIG.r || credential.p !== KDF_CONFIG.p || credential.maxmem !== KDF_CONFIG.maxmem || credential.salt.length !== KDF_CONFIG.saltBytes || credential.derivedKey.length !== KDF_CONFIG.keyLen) return false;
  const derived = await scheduler.derive(password, credential.salt, signal);
  return derived.length === credential.derivedKey.length && timingSafeEqual(derived, credential.derivedKey);
}
var AuthRateLimiter = class _AuthRateLimiter {
  #byLogin = /* @__PURE__ */ new Map();
  #bySource = /* @__PURE__ */ new Map();
  #maxKeys = 4096;
  #prune(map, now, windowMs) {
    for (const [key, bucket] of map) if (now - bucket.windowStarted >= windowMs) map.delete(key);
  }
  #bound(map) {
    while (map.size > this.#maxKeys) {
      const key = map.keys().next().value;
      if (key === void 0) break;
      map.delete(key);
    }
  }
  static ACCOUNT_WINDOW_MS = 15 * 60 * 1e3;
  static SOURCE_WINDOW_MS = 60 * 1e3;
  static SOURCE_LIMIT = 30;
  static ACCOUNT_FAILURE_LIMIT = 5;
  #retryAfter(bucket, windowMs, now) {
    if (bucket === void 0) return 1e3;
    return Math.max(1e3, bucket.windowStarted + windowMs - now);
  }
  check(loginName, source, now = Date.now()) {
    this.#prune(this.#byLogin, now, _AuthRateLimiter.ACCOUNT_WINDOW_MS);
    this.#prune(this.#bySource, now, _AuthRateLimiter.SOURCE_WINDOW_MS);
    const account = this.#byLogin.get(loginName);
    const client = this.#bySource.get(source);
    if ((account?.count ?? 0) >= _AuthRateLimiter.ACCOUNT_FAILURE_LIMIT) throw new IdentityError("AUTH_RATE_LIMITED", "authentication attempts are temporarily limited", true, this.#retryAfter(account, _AuthRateLimiter.ACCOUNT_WINDOW_MS, now));
    if ((client?.count ?? 0) >= _AuthRateLimiter.SOURCE_LIMIT) throw new IdentityError("AUTH_RATE_LIMITED", "authentication attempts are temporarily limited", true, this.#retryAfter(client, _AuthRateLimiter.SOURCE_WINDOW_MS, now));
  }
  /** Count every syntactically valid authentication attempt before KDF work. */
  attempt(loginName, source, now = Date.now()) {
    this.check(loginName, source, now);
    const current = this.#bySource.get(source);
    if (current === void 0 || now - current.windowStarted >= _AuthRateLimiter.SOURCE_WINDOW_MS) this.#bySource.set(source, { count: 1, windowStarted: now });
    else current.count += 1;
    this.#bound(this.#bySource);
  }
  failure(loginName, source, now = Date.now()) {
    const bump = (map, key, windowMs) => {
      const current = map.get(key);
      if (current === void 0 || now - current.windowStarted >= windowMs) map.set(key, { count: 1, windowStarted: now });
      else current.count += 1;
    };
    bump(this.#byLogin, loginName, _AuthRateLimiter.ACCOUNT_WINDOW_MS);
    this.#bound(this.#byLogin);
  }
};
var IdentityService = class {
  #store;
  #kdf;
  #limiter;
  constructor(store, options = {}) {
    this.#store = store;
    this.#kdf = options.kdf ?? new KdfScheduler();
    this.#limiter = options.limiter ?? new AuthRateLimiter();
  }
  get setupState() {
    return this.#store.getSetupState();
  }
  get scheduler() {
    return this.#kdf;
  }
  async bootstrap(input) {
    const loginName = validateLoginName(input.loginName);
    const displayName = validateDisplayName(input.displayName);
    const password = validatePassword(input.password);
    const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE);
    const domains = validateDomains(input.domains ?? []);
    const learningTracks = validateLearningTracks(input.learningTracks ?? []);
    const goalText = validateGoalText(input.goalText ?? "");
    this.#limiter.attempt(loginName, input.source ?? "bootstrap");
    const credential = await derivePassword(this.#kdf, password, input.signal);
    if (input.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const result = this.#store.bootstrap({ loginName, displayName, timezone, domains, learningTracks, goalText, now: (/* @__PURE__ */ new Date()).toISOString(), credential });
    if (result.kind === "already_initialized") throw new IdentityError("ALREADY_INITIALIZED", "service is already initialized");
    return result.user;
  }
  async register(input) {
    const loginName = validateLoginName(input.loginName);
    const displayName = validateDisplayName(input.displayName);
    const password = validatePassword(input.password);
    const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE);
    const domains = validateDomains(input.domains ?? []);
    const learningTracks = validateLearningTracks(input.learningTracks ?? []);
    const goalText = validateGoalText(input.goalText ?? "");
    this.#limiter.attempt(loginName, input.source ?? "register");
    const credential = await derivePassword(this.#kdf, password, input.signal);
    if (input.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const result = this.#store.register({ loginName, displayName, timezone, domains, learningTracks, goalText, now: (/* @__PURE__ */ new Date()).toISOString(), credential });
    if (result.kind === "setup_required") throw new IdentityError("SETUP_REQUIRED", "service setup is required");
    if (result.kind === "login_name_taken") throw new IdentityError("LOGIN_NAME_TAKEN", "login name is already in use");
    return result.user;
  }
  async login(input) {
    const loginName = validateLoginName(input.loginName);
    const password = validatePassword(input.password);
    this.#limiter.attempt(loginName, input.source);
    const lookup = this.#store.findLogin(loginName);
    let valid2 = false;
    try {
      valid2 = await verifyPassword(this.#kdf, password, lookup?.credential ?? { algorithm: "scrypt", version: 1, n: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem, salt: Buffer.alloc(KDF_CONFIG.saltBytes), derivedKey: Buffer.alloc(KDF_CONFIG.keyLen) }, input.signal);
    } catch (error) {
      if (error instanceof IdentityError && error.code === "AUTH_RATE_LIMITED") throw error;
      valid2 = false;
    }
    if (input.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (!lookup || lookup.status !== "active" || !valid2) {
      this.#limiter.failure(loginName, input.source);
      throw new IdentityError("INVALID_CREDENTIALS", "invalid credentials");
    }
    const token2 = makeToken();
    const createdAt = /* @__PURE__ */ new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString();
    this.#store.createSession({ sessionId: randomUUID16(), userId: lookup.userId, tokenHash: tokenHash(token2), createdAt: createdAt.toISOString(), expiresAt, revokeTokenHash: input.oldToken ? tokenHash(input.oldToken) : void 0 });
    const user = this.#store.getProfile(lookup.userId);
    if (user === void 0) throw new IdentityError("STORAGE_UNAVAILABLE", "user profile unavailable");
    return { user, token: token2, expiresAt };
  }
  actor(token2, now = (/* @__PURE__ */ new Date()).toISOString()) {
    return token2 === void 0 ? void 0 : this.#store.findActor(tokenHash(token2), now);
  }
  profile(userId) {
    return this.#store.getProfile(userId);
  }
  spaces(userId) {
    return this.#store.getSpaces(userId);
  }
  logout(token2) {
    if (token2 !== void 0) this.#store.revokeSession(tokenHash(token2), (/* @__PURE__ */ new Date()).toISOString());
  }
  preferences(userId, expectedRevision, patch) {
    const result = this.#store.updatePreferences(userId, expectedRevision, patch, (/* @__PURE__ */ new Date()).toISOString());
    if (result.kind === "conflict") throw new IdentityError("REVISION_CONFLICT", "profile revision has changed");
    return result.user;
  }
  async close() {
    await this.#kdf.close();
  }
};

// src/host/identity-http.ts
import { createHash as createHash15, randomUUID as randomUUID17 } from "node:crypto";
import { isIP } from "node:net";
var HttpError = class extends Error {
  constructor(status, code, message, retryable = false, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.headers = headers;
    this.name = "HttpError";
  }
};
function sendJson2(res, status, payload, headers = {}) {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}
function sendEmpty(res, status, headers = {}) {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end();
}
function isLoopbackAddress(value) {
  if (value === void 0) return false;
  let unwrapped = value.trim().toLowerCase();
  if (unwrapped.startsWith("[") && unwrapped.endsWith("]")) unwrapped = unwrapped.slice(1, -1);
  const zone = unwrapped.indexOf("%");
  if (zone >= 0) unwrapped = unwrapped.slice(0, zone);
  if (isIP(unwrapped) === 4) {
    const octets = unwrapped.split(".").map(Number);
    return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) && octets[0] === 127;
  }
  if (isIP(unwrapped) !== 6) return false;
  const ipv6 = unwrapped.includes(".") ? (() => {
    const at = unwrapped.lastIndexOf(":");
    const dotted = unwrapped.slice(at + 1).split(".").map(Number);
    if (dotted.length !== 4 || dotted.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return void 0;
    return `${unwrapped.slice(0, at)}:${(dotted[0] << 8 | dotted[1]).toString(16)}:${(dotted[2] << 8 | dotted[3]).toString(16)}`;
  })() : unwrapped;
  if (ipv6 === void 0) return false;
  const groups = ipv6.split("::");
  if (groups.length > 2) return false;
  const left = groups[0] === "" ? [] : groups[0].split(":");
  const right = groups.length === 2 && groups[1] !== "" ? groups[1].split(":") : [];
  if ([...left, ...right].some((item) => !/^[0-9a-f]{1,4}$/u.test(item))) return false;
  const missing2 = 8 - left.length - right.length;
  if (groups.length === 1 && missing2 !== 0 || groups.length === 2 && missing2 < 1) return false;
  const expanded = groups.length === 1 ? left : [...left, ...Array(missing2).fill("0"), ...right];
  if (expanded.length !== 8) return false;
  const numbers = expanded.map((item) => Number.parseInt(item, 16));
  const plainLoopback = numbers.slice(0, 7).every((item) => item === 0) && numbers[7] === 1;
  const mappedLoopback = numbers.slice(0, 5).every((item) => item === 0) && numbers[5] === 65535 && numbers[6] >>> 8 === 127;
  return plainLoopback || mappedLoopback;
}
function isIdentityRuntimeAvailable(facts) {
  if (facts.connection?.authentication === void 0 || facts.connection.browserPeer?.signal?.aborted === true) return false;
  if (!isLoopbackAddress(facts.host)) return false;
  if (facts.protocol !== "http:" && facts.protocol !== "https:") return false;
  if (!Number.isInteger(facts.port) || (facts.port ?? 0) <= 0 || (facts.port ?? 0) > 65535) return false;
  if (facts.origin === void 0) return false;
  try {
    const parsed = new URL(facts.origin);
    if (parsed.protocol !== facts.protocol || !isLoopbackAddress(parsed.hostname)) return false;
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    return port === facts.port;
  } catch {
    return false;
  }
}
function businessCookieName(serviceId, origin) {
  return `kos_session_${createHash15("sha256").update(`${serviceId}|${origin}`).digest("hex").slice(0, 16)}`;
}
function readCookie(req, name2) {
  const raw = req.headers.cookie;
  if (typeof raw !== "string") return void 0;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name2) return rest.join("=") || void 0;
  }
  return void 0;
}
function sessionCookie(name2, token2, origin, protocol, maxAge) {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${name2}=${token2}; Path=/knowledge/v1; HttpOnly; SameSite=Strict${secure}; Max-Age=${String(maxAge)}`;
}
function clearCookie(name2, origin, protocol) {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${name2}=; Path=/knowledge/v1; HttpOnly; SameSite=Strict${secure}; Max-Age=0`;
}
async function readBody2(req) {
  return await new Promise((resolve2, reject2) => {
    let total = 0;
    let settled = false;
    const chunks = [];
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.resume();
      reject2(error);
    };
    req.on("data", (chunk2) => {
      if (settled) return;
      total += chunk2.length;
      if (total > MAX_REQUEST_BODY_BYTES2) {
        fail(new HttpError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
        return;
      }
      ;
      chunks.push(chunk2);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      let text2;
      try {
        text2 = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      } catch {
        reject2(new HttpError(400, "INVALID_JSON", "request body is not valid UTF-8"));
        return;
      }
      try {
        resolve2(JSON.parse(text2));
      } catch {
        reject2(new HttpError(400, "INVALID_JSON", "request body is not valid JSON"));
      }
    });
    req.on("error", () => fail(new HttpError(400, "INVALID_JSON", "request body could not be read")));
    req.on("aborted", () => fail(new HttpError(400, "INVALID_JSON", "request was aborted")));
  });
}
function bodyObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError(422, "INPUT_INVALID", "body must be a JSON object");
  return value;
}
function assertKeys(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new HttpError(422, "INPUT_INVALID", "body contains an unsupported field");
}
function requireJson(req) {
  const raw = req.headers["content-type"];
  if (typeof raw !== "string" || raw.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  const charset = raw.split(";").slice(1).map((item) => item.trim().toLowerCase()).find((item) => item.startsWith("charset="));
  if (charset !== void 0 && charset !== "charset=utf-8") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type charset must be utf-8");
}
function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, "METHOD_NOT_ALLOWED", "method not allowed", false, { allow: method });
}
function safeProfile(profile) {
  return { id: profile.id, login_name: profile.loginName, display_name: profile.displayName, role: profile.role, status: profile.status, timezone: profile.timezone, planning_home_service_id: profile.planningHomeServiceId, domains: profile.domains, learning_tracks: profile.learningTracks, goal_text: profile.goalText, revision: profile.revision, personal_space_id: profile.personalSpaceId, created_at: profile.createdAt, updated_at: profile.updatedAt };
}
function requestSource(req) {
  return req.socket?.remoteAddress ?? "unknown";
}
function requestSignal(req, res) {
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  req.once("close", () => {
    if (!req.complete) controller.abort();
  });
  res.once("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}
function createIdentityHandlers(options) {
  const { service } = options;
  const meta = (requestId) => ({ request_id: requestId, service_id: service.setupState.serviceId, server_time: (/* @__PURE__ */ new Date()).toISOString() });
  const withMeta = (requestId, data) => ({ data, meta: meta(requestId) });
  const tokenFor = (req) => {
    const origin = options.origin();
    if (origin === void 0) return void 0;
    const state = service.setupState;
    return readCookie(req, businessCookieName(state.serviceId, origin));
  };
  const assertAvailable = () => {
    if (!options.isAvailable() || options.origin() === void 0 || options.host() === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
  };
  const assertNoQuery = (req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if ([...url.searchParams.keys()].length > 0) throw new HttpError(422, "INPUT_INVALID", "query parameters are not supported");
  };
  const assertTrust = (req, mutation) => {
    const origin = options.origin();
    if (origin === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
    const expectedHost = new URL(origin).host;
    if (req.headers.host !== expectedHost) throw new HttpError(403, "CSRF_REJECTED", "request authority is not trusted");
    const suppliedOrigin = req.headers.origin;
    if (suppliedOrigin !== void 0 && suppliedOrigin !== origin) throw new HttpError(403, "CSRF_REJECTED", "request origin is not trusted");
    if (suppliedOrigin === "null") throw new HttpError(403, "CSRF_REJECTED", "opaque origin is not trusted");
    const fetchSite = req.headers["sec-fetch-site"];
    if (typeof fetchSite === "string" && fetchSite.toLowerCase() === "cross-site") throw new HttpError(403, "CSRF_REJECTED", "cross-site request is not trusted");
    if (mutation && req.headers["x-knowledgeos-request"] !== "1") throw new HttpError(403, "CSRF_REJECTED", "missing KnowledgeOS request header");
  };
  const actorFor = (req) => service.actor(tokenFor(req));
  const requireActor = (req) => {
    const actor2 = actorFor(req);
    if (actor2 === void 0) throw new HttpError(401, "SESSION_EXPIRED", "business session is required");
    return actor2;
  };
  const dispatch = async (req, res, action2) => {
    const requestId = randomUUID17();
    try {
      assertAvailable();
      assertNoQuery(req);
      await action2();
    } catch (error) {
      if (res.writableEnded) return;
      let mapped;
      if (error instanceof HttpError) mapped = error;
      else if (error instanceof IdentityError) {
        const status2 = error.code === "INVALID_CREDENTIALS" ? 401 : error.code === "AUTH_RATE_LIMITED" ? 429 : error.code === "SETUP_REQUIRED" || error.code === "ALREADY_INITIALIZED" || error.code === "LOGIN_NAME_TAKEN" || error.code === "REVISION_CONFLICT" ? 409 : error.code === "INPUT_INVALID" ? 422 : 503;
        mapped = new HttpError(status2, error.code, error.message, error.retryable, error.code === "AUTH_RATE_LIMITED" ? { "retry-after": String(Math.max(1, Math.ceil((error.retryAfterMs ?? 6e4) / 1e3))) } : {});
      } else if (error instanceof Error && ["STORAGE_UNAVAILABLE", "STORAGE_INCOMPATIBLE", "STORAGE_BUSY", "STORAGE_CLOSED"].includes(String(error.code))) {
        const code = String(error.code);
        mapped = new HttpError(503, code, "storage is unavailable", true);
      } else {
        mapped = new HttpError(500, "INTERNAL_ERROR", "internal error");
      }
      if (mapped.status === 204) {
        sendEmpty(res, 204, mapped.headers);
        return;
      }
      sendJson2(res, mapped.status, { code: mapped.code, message: mapped.message, request_id: requestId, retryable: mapped.retryable, safe_details: {} }, mapped.headers);
    }
  };
  const status = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const state = service.setupState;
    sendJson2(res, 200, withMeta(randomUUID17(), { setup_required: !state.initialized, available: true }));
  });
  const bootstrap = async (req, res, peer) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    if (!isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackAddress(options.host()) || peer?.principal?.kind !== "owner") throw new HttpError(403, "FORBIDDEN", "owner loopback admission is required");
    const signal = requestSignal(req, res);
    requireJson(req);
    const body2 = bodyObject(await readBody2(req));
    assertKeys(body2, ["login_name", "password", "display_name", "timezone"]);
    const user = await service.bootstrap({ loginName: body2.login_name, password: body2.password, displayName: body2.display_name, timezone: body2.timezone, source: requestSource(req), signal });
    sendJson2(res, 201, withMeta(randomUUID17(), safeProfile(user)));
  });
  const register = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    const signal = requestSignal(req, res);
    requireJson(req);
    const body2 = bodyObject(await readBody2(req));
    assertKeys(body2, ["login_name", "password", "display_name", "timezone"]);
    const user = await service.register({ loginName: body2.login_name, password: body2.password, displayName: body2.display_name, timezone: body2.timezone, source: requestSource(req), signal });
    sendJson2(res, 201, withMeta(randomUUID17(), safeProfile(user)));
  });
  const login = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    const signal = requestSignal(req, res);
    requireJson(req);
    const body2 = bodyObject(await readBody2(req));
    assertKeys(body2, ["login_name", "password"]);
    const result = await service.login({ loginName: body2.login_name, password: body2.password, oldToken: tokenFor(req), source: requestSource(req), signal });
    const origin = options.origin();
    if (origin === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
    const state = service.setupState;
    const name2 = businessCookieName(state.serviceId, origin);
    const maxAge = Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1e3);
    sendJson2(res, 200, withMeta(randomUUID17(), safeProfile(result.user)), { "set-cookie": sessionCookie(name2, result.token, origin, options.protocol(), maxAge) });
  });
  const logout = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    requireJson(req);
    const body2 = bodyObject(await readBody2(req));
    assertKeys(body2, []);
    service.logout(tokenFor(req));
    const origin = options.origin();
    if (origin === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
    const state = service.setupState;
    const name2 = businessCookieName(state.serviceId, origin);
    sendEmpty(res, 204, { "set-cookie": clearCookie(name2, origin, options.protocol()) });
  });
  const me = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const actor2 = requireActor(req);
    const profile = service.profile(actor2.userId);
    if (profile === void 0) throw new HttpError(401, "SESSION_EXPIRED", "business session is required");
    sendJson2(res, 200, withMeta(randomUUID17(), safeProfile(profile)));
  });
  const preferences = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "PATCH");
    assertTrust(req, true);
    const actor2 = requireActor(req);
    requireJson(req);
    const body2 = bodyObject(await readBody2(req));
    assertKeys(body2, ["expected_revision", "display_name", "timezone", "domains", "learning_tracks", "goal_text"]);
    const expectedRevision = validateExpectedRevision(body2.expected_revision);
    const patch = {};
    if (body2.display_name !== void 0) patch.displayName = validateDisplayName(body2.display_name);
    if (body2.timezone !== void 0) patch.timezone = validateTimezone(body2.timezone);
    if (body2.domains !== void 0) patch.domains = validateDomains(body2.domains);
    if (body2.learning_tracks !== void 0) patch.learningTracks = validateLearningTracks(body2.learning_tracks);
    if (body2.goal_text !== void 0) patch.goalText = validateGoalText(body2.goal_text);
    if (Object.keys(patch).length === 0) throw new HttpError(422, "INPUT_INVALID", "at least one preference is required");
    sendJson2(res, 200, withMeta(randomUUID17(), safeProfile(service.preferences(actor2.userId, expectedRevision, patch))));
  });
  const spaces = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const actor2 = requireActor(req);
    const data = service.spaces(actor2.userId).map((space) => ({ id: space.id, service_id: space.serviceId, kind: space.kind, owner_user_id: space.ownerUserId, status: space.status, revision: space.revision, created_at: space.createdAt, updated_at: space.updatedAt }));
    sendJson2(res, 200, withMeta(randomUUID17(), data));
  });
  return { status, bootstrap, register, login, logout, me, preferences, spaces };
}
function buildAccountHtmlLegacy() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \u8D26\u53F7</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:880px;margin:0 auto;padding:32px 20px 56px}h1{margin:0 0 8px;font-size:28px}p{line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:20px;box-shadow:0 8px 24px #31535b12}label{display:block;margin:10px 0 5px;color:#597078;font-size:13px}input,textarea,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}textarea{min-height:90px}button{margin-top:14px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}button.secondary{background:#edf5f6;color:#315e65}small{color:#6b7d82}.message{padding:10px 12px;border-radius:8px;background:#edf5f6;margin:12px 0;white-space:pre-wrap}.hidden{display:none}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf5f6;color:#315e65;font-size:12px}</style></head><body><main><h1>KnowledgeOS \u8D26\u53F7</h1><p id="state">\u6B63\u5728\u8BFB\u53D6\u672C\u673A\u4E1A\u52A1\u8EAB\u4EFD\u2026</p><div id="message" class="message hidden"></div><div class="grid"><section class="card"><h2>\u767B\u5F55</h2><label>\u767B\u5F55\u540D</label><input id="login_name"><label>\u5BC6\u7801</label><input id="login_password" type="password"><button id="login">\u767B\u5F55</button></section><section class="card"><h2>\u6CE8\u518C\u666E\u901A\u8D26\u53F7</h2><label>\u767B\u5F55\u540D</label><input id="register_name"><label>\u663E\u793A\u540D\u79F0</label><input id="register_display"><label>\u5BC6\u7801\uFF0815\u2013128 \u4F4D\uFF09</label><input id="register_password" type="password"><button id="register">\u6CE8\u518C</button></section></div><section id="profile" class="card hidden" style="margin-top:16px"><h2>\u6211\u7684\u4E2A\u4EBA\u7A7A\u95F4</h2><p id="who"></p><label>\u65B9\u5411\uFF08\u9017\u53F7\u5206\u9694\uFF09</label><input id="domains" placeholder="software_engineering,system_architecture"><label>\u5B66\u4E60\u4E3B\u7EBF\uFF08\u9017\u53F7\u5206\u9694\uFF09</label><input id="tracks" placeholder="engineering_practice,architecture_exam"><label>\u76EE\u6807</label><textarea id="goal"></textarea><label>\u65F6\u533A</label><input id="timezone" value="Asia/Shanghai"><button id="save">\u4FDD\u5B58\u4E2A\u4EBA\u504F\u597D</button><button id="logout" class="secondary">\u9000\u51FA</button></section></main><script>(async()=>{const $=id=>document.getElementById(id);let revision=1;let generation=0;const msg=(text,bad=false)=>{const el=$("message");el.textContent=text;el.className="message";el.style.background=bad?"#fbefee":"#edf5f6"};const call=async(path,options={})=>{const headers={...(options.headers||{})};if(options.method&&options.method!=="GET"){headers["content-type"]="application/json";headers["x-knowledgeos-request"]="1"}const r=await fetch(path,{...options,headers});let j;try{j=await r.json()}catch{}if(!r.ok)throw new Error(j?.message||("\u8BF7\u6C42\u5931\u8D25 "+r.status));return j};const load=async()=>{const requestGeneration=++generation;try{const j=await call("/knowledge/v1/me");if(requestGeneration!==generation)return;const u=j.data;revision=u.revision;$("state").textContent="\u5DF2\u767B\u5F55 \xB7 "+u.role;$("who").textContent=u.display_name+"\uFF08"+u.login_name+"\uFF09 \xB7 \u4E2A\u4EBA\u7A7A\u95F4 "+u.personal_space_id;$("domains").value=(u.domains||[]).join(",");$("tracks").value=(u.learning_tracks||[]).join(",");$("goal").value=u.goal_text||"";$("timezone").value=u.timezone||"Asia/Shanghai";$("profile").className="card"}catch{if(requestGeneration!==generation)return;$("state").textContent="\u672A\u767B\u5F55\uFF0C\u53EF\u6CE8\u518C\u6216\u767B\u5F55";$("profile").className="card hidden"}};$("login").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/login",{method:"POST",body:JSON.stringify({login_name:$("login_name").value,password:$("login_password").value})});if(requestGeneration!==generation)return;$("login_password").value="";await load();msg("\u767B\u5F55\u6210\u529F")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("register").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/register",{method:"POST",body:JSON.stringify({login_name:$("register_name").value,display_name:$("register_display").value,password:$("register_password").value})});if(requestGeneration!==generation)return;$("register_password").value="";msg("\u6CE8\u518C\u6210\u529F\uFF0C\u8BF7\u767B\u5F55")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("save").onclick=async()=>{const requestGeneration=generation;try{const j=await call("/knowledge/v1/me/preferences",{method:"PATCH",body:JSON.stringify({expected_revision:revision,domains:$("domains").value.split(",").map(x=>x.trim()).filter(Boolean),learning_tracks:$("tracks").value.split(",").map(x=>x.trim()).filter(Boolean),goal_text:$("goal").value,timezone:$("timezone").value})});if(requestGeneration!==generation)return;revision=j.data.revision;msg("\u4E2A\u4EBA\u504F\u597D\u5DF2\u4FDD\u5B58")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("logout").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/logout",{method:"POST",body:"{}"});if(requestGeneration!==generation)return;$("profile").className="card hidden";$("state").textContent="\u5DF2\u9000\u51FA";$("who").textContent="";msg("\u5DF2\u9000\u51FA")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};await load()})()</script></body></html>`;
}
function buildAccountHtml() {
  const html = buildAccountHtmlLegacy();
  const script = String.raw`<script>(async()=>{const $=id=>document.getElementById(id);let revision=0,generation=0,authenticatedGeneration=0,canSave=false;const msg=(text,bad=false)=>{const el=$("message");el.textContent=text;el.className="message";el.style.background=bad?"#fbefee":"#edf5f6"};const clearProfile=()=>{revision=0;authenticatedGeneration=0;canSave=false;$("save").disabled=true;["who","domains","tracks","goal","timezone","login_password","register_password"].forEach(id=>{const el=$(id);if(el)el.value=""});$("profile").className="card hidden"};const stateFor=e=>e?.status===401?"未登录，可注册或登录":e?.status===429?"请求受限，请稍后再试":e?.status===503?"服务不可用，请稍后重试":"请求失败";const call=async(path,options={})=>{const headers={...(options.headers||{})};if(options.method&&options.method!=="GET"){headers["content-type"]="application/json";headers["x-knowledgeos-request"]="1"}const r=await fetch(path,{...options,headers});let j;try{j=await r.json()}catch{}if(!r.ok){const e=new Error(j?.message||("请求失败 "+r.status));e.status=r.status;throw e}return j};const load=async(existingGeneration)=>{const my=existingGeneration===undefined?++generation:existingGeneration;clearProfile();try{const j=await call("/knowledge/v1/me");if(my!==generation)return;const u=j.data;revision=u.revision;$("state").textContent="已登录 · "+u.role;$("who").textContent=u.display_name+"（"+u.login_name+"） · 个人空间 "+u.personal_space_id;$("domains").value=(u.domains||[]).join(",");$("tracks").value=(u.learning_tracks||[]).join(",");$("goal").value=u.goal_text||"";$("timezone").value=u.timezone||"Asia/Shanghai";authenticatedGeneration=my;canSave=true;$("save").disabled=false;$("profile").className="card"}catch(e){if(my!==generation)return;clearProfile();$("state").textContent=stateFor(e);msg(e?.message||"请求失败",true)}};$("login").onclick=async()=>{const loginName=$("login_name").value;const loginPassword=$("login_password").value;const my=++generation;clearProfile();$("state").textContent="正在登录…";try{await call("/knowledge/v1/auth/login",{method:"POST",body:JSON.stringify({login_name:loginName,password:loginPassword})});if(my!==generation)return;$("login_password").value="";await load(my);if(my===generation&&canSave)msg("登录成功")}catch(e){if(my!==generation)return;clearProfile();$("state").textContent=stateFor(e);msg(e?.message||"登录失败",true)}};$("register").onclick=async()=>{const my=++generation;try{await call("/knowledge/v1/auth/register",{method:"POST",body:JSON.stringify({login_name:$("register_name").value,display_name:$("register_display").value,password:$("register_password").value})});if(my!==generation)return;$("register_password").value="";msg("注册成功，请登录")}catch(e){if(my!==generation)return;msg(e?.message||"注册失败",true)}};$("save").onclick=async()=>{const my=authenticatedGeneration;if(!canSave||my!==generation)return;try{const j=await call("/knowledge/v1/me/preferences",{method:"PATCH",body:JSON.stringify({expected_revision:revision,domains:$("domains").value.split(",").map(x=>x.trim()).filter(Boolean),learning_tracks:$("tracks").value.split(",").map(x=>x.trim()).filter(Boolean),goal_text:$("goal").value,timezone:$("timezone").value})});if(my!==generation)return;revision=j.data.revision;msg("个人偏好已保存")}catch(e){if(my!==generation)return;if(e?.status===401||e?.status===503){clearProfile();$("state").textContent=stateFor(e)}msg(e?.message||"保存失败",true)}};$("logout").onclick=async()=>{const my=++generation;clearProfile();$("state").textContent="正在退出…";try{await call("/knowledge/v1/auth/logout",{method:"POST",body:"{}"});if(my!==generation)return;$("state").textContent="已退出";msg("已退出")}catch(e){if(my!==generation)return;$("state").textContent=stateFor(e);msg(e?.message||"退出失败",true)}};await load()})()</script>`;
  return html.replace(/<script>[\s\S]*?<\/script>/, script);
}
function buildSetupHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \u521D\u59CB\u5316</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:48px 20px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:24px}label{display:block;margin:12px 0 5px;color:#597078;font-size:13px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}button{margin-top:16px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}.message{margin-top:12px;padding:10px;border-radius:8px;background:#edf5f6;white-space:pre-wrap}</style></head><body><main><section class="card"><h1>\u9996\u6B21\u7BA1\u7406\u5458\u521D\u59CB\u5316</h1><p>\u4EC5\u53EF\u4FE1\u672C\u673A DSH owner \u53EF\u4EE5\u5B8C\u6210\u4E00\u6B21\u521D\u59CB\u5316\u3002</p><label>\u7BA1\u7406\u5458\u767B\u5F55\u540D</label><input id="name"><label>\u663E\u793A\u540D\u79F0</label><input id="display"><label>\u5BC6\u7801\uFF0815\u2013128 \u4F4D\uFF09</label><input id="password" type="password"><button id="submit">\u521B\u5EFA\u7BA1\u7406\u5458</button><div id="message" class="message"></div></section></main><script>document.getElementById('submit').onclick=async()=>{const m=document.getElementById('message');try{const r=await fetch('/knowledge/v1/auth/bootstrap',{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1'},body:JSON.stringify({login_name:document.getElementById('name').value,display_name:document.getElementById('display').value,password:document.getElementById('password').value})});const j=await r.json();if(!r.ok)throw new Error(j.message||('\u8BF7\u6C42\u5931\u8D25 '+r.status));document.getElementById('password').value='';m.textContent='\u521D\u59CB\u5316\u5B8C\u6210\uFF0C\u8BF7\u524D\u5F80\u8D26\u53F7\u9875\u767B\u5F55\u3002'}catch(e){m.textContent=e.message}}</script></body></html>`;
}

// src/host/objects-http.ts
import { randomUUID as randomUUID18 } from "node:crypto";
var ObjectHttpError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
var json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(JSON.stringify(data));
};
var pathOf = (req) => new URL(req.url ?? "/", "http://localhost").pathname;
var safeObject = (object2, includeBody = true) => ({ id: object2.id, service_id: object2.serviceId, space_id: object2.spaceId, scope: object2.scope, project_id: object2.projectId, owner_user_id: object2.ownerUserId, object_type: object2.objectType, title: object2.title, ...includeBody ? { body: object2.body } : {}, status: object2.status, revision: object2.revision, created_at: object2.createdAt, updated_at: object2.updatedAt });
var readBody3 = async (req) => await new Promise((resolve2, reject2) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk2) => {
    size += chunk2.length;
    if (size > 16 * 1024) {
      reject2(new ObjectHttpError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
      req.resume();
    } else chunks.push(chunk2);
  });
  req.on("end", () => {
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
      resolve2(value);
    } catch {
      reject2(new ObjectHttpError(400, "INVALID_JSON", "request body is not valid JSON"));
    }
  });
  req.on("error", () => reject2(new ObjectHttpError(400, "INVALID_JSON", "request body could not be read")));
});
var keys = (body2, allowed) => {
  if (Object.keys(body2).some((key) => !allowed.includes(key))) throw new ObjectHttpError(422, "INPUT_INVALID", "body contains an unsupported field");
};
var action = (value) => {
  if (typeof value !== "string" || !AUTH_ACTIONS.includes(value)) throw new ObjectHttpError(422, "INPUT_INVALID", "action is invalid");
  return value;
};
var text = (value, name2, max2) => {
  if (typeof value !== "string" || value.length < 1 || value.length > max2 || !value.isWellFormed()) throw new ObjectHttpError(422, "INPUT_INVALID", `${name2} is invalid`);
  return value;
};
function trust(req, origin, mutation) {
  if (origin === void 0 || req.headers.host !== new URL(origin).host) throw new ObjectHttpError(403, "CSRF_REJECTED", "request authority is not trusted");
  if (req.headers.origin !== void 0 && req.headers.origin !== origin) throw new ObjectHttpError(403, "CSRF_REJECTED", "request origin is not trusted");
  if (req.headers["sec-fetch-site"] === "cross-site") throw new ObjectHttpError(403, "CSRF_REJECTED", "cross-site request is not trusted");
  if (mutation && req.headers["x-knowledgeos-request"] !== "1") throw new ObjectHttpError(403, "CSRF_REJECTED", "missing KnowledgeOS request header");
  if (new URL(req.url ?? "/", origin).search) throw new ObjectHttpError(422, "INPUT_INVALID", "query parameters are not supported");
}
function actor(options, req) {
  const value = options.actorFor(req);
  if (value === void 0) throw new ObjectHttpError(401, "SESSION_EXPIRED", "business session is required");
  return value;
}
function createObjectHandlers(options) {
  return async (req, res) => {
    const requestId = randomUUID18();
    try {
      const path2 = pathOf(req);
      const segments = path2.split("/").filter(Boolean);
      trust(req, options.origin(), req.method !== "GET");
      const current = actor(options, req);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (segments[2] === "jobs") {
        if (segments.length === 3 && req.method === "POST") {
          const body2 = await readBody3(req);
          keys(body2, ["object_id", "expected_revision", "idempotency_key"]);
          if (!Number.isSafeInteger(body2.expected_revision) || Number(body2.expected_revision) < 1) throw new JobError(422, "INPUT_INVALID");
          const id4 = options.storage.jobs.enqueue(current, text(body2.object_id, "object_id", 80), Number(body2.expected_revision), text(body2.idempotency_key, "idempotency_key", 128));
          json(res, 202, { data: { id: id4 } });
          return;
        }
        const cancel = segments.length === 5 && segments[4] === "cancel" && req.method === "POST";
        if (segments[3] && (cancel || segments.length === 4 && req.method === "GET")) {
          json(res, 200, { data: options.storage.jobs.inspect(current, segments[3], cancel) });
          return;
        }
      }
      if (segments[2] === "projects" && segments.length === 3 && req.method === "GET") {
        json(res, 200, { data: { items: options.storage.ownedProjects(current) } });
        return;
      }
      if (segments[2] === "projects" && segments.length === 3 && req.method === "POST") {
        const body2 = await readBody3(req);
        keys(body2, ["name"]);
        const project = options.storage.createProject({ id: randomUUID18(), serviceId: current.serviceId, ownerUserId: current.userId, name: text(body2.name, "name", 200), now });
        json(res, 201, { data: project, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
        return;
      }
      if (segments[2] === "projects" && segments.length === 5 && segments[4] === "memberships" && req.method === "POST") {
        const body2 = await readBody3(req);
        keys(body2, ["user_id", "role", "valid_from", "expires_at"]);
        const projectId = segments[3];
        if (!options.storage.canManageProject(current, projectId)) throw new ObjectHttpError(404, "NOT_FOUND", "project not found");
        options.storage.addProjectMembership({ projectId, userId: text(body2.user_id, "user_id", 80), role: body2.role === void 0 ? "member" : text(body2.role, "role", 20), validFrom: body2.valid_from === void 0 ? now : text(body2.valid_from, "valid_from", 40), expiresAt: body2.expires_at === void 0 ? void 0 : text(body2.expires_at, "expires_at", 40) });
        res.statusCode = 204;
        res.end();
        return;
      }
      if (segments[2] === "objects") {
        if (segments.length === 3 && req.method === "GET") {
          json(res, 200, { data: options.storage.listObjects(current, "read", now).map((item) => safeObject(item, false)), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
        if (segments.length === 3 && req.method === "POST") {
          const body2 = await readBody3(req);
          keys(body2, ["title", "body", "object_type", "scope", "project_id"]);
          const scope = body2.scope ?? "personal";
          if (scope !== "personal" && scope !== "project") throw new ObjectHttpError(422, "INPUT_INVALID", "scope is invalid");
          const projectId = body2.project_id === void 0 ? void 0 : text(body2.project_id, "project_id", 80);
          if (scope === "project" && projectId === void 0) throw new ObjectHttpError(422, "INPUT_INVALID", "project_id is required for project objects");
          if (scope === "personal" && projectId !== void 0) throw new ObjectHttpError(422, "INPUT_INVALID", "project_id is not allowed for personal objects");
          if (scope === "project" && !options.storage.canCreateProjectObject(current, projectId, now)) throw new ObjectHttpError(404, "NOT_FOUND", "project not found");
          const title = text(body2.title, "title", 200);
          const content = text(body2.body, "body", 1e5);
          const object2 = options.storage.createObject({ id: randomUUID18(), serviceId: current.serviceId, spaceId: current.personalSpaceId, scope, projectId, ownerUserId: current.userId, objectType: body2.object_type === void 0 ? "note" : text(body2.object_type, "object_type", 80), title, body: content, now });
          json(res, 201, { data: safeObject(object2), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
        const objectId = segments[3];
        if (objectId === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
        if (segments.length === 4 && req.method === "GET") {
          const object2 = options.storage.authorizeObject(current, objectId, "read", now);
          if (object2 === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          json(res, 200, { data: safeObject(object2), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
        if (segments.length === 4 && req.method === "PATCH") {
          const body2 = await readBody3(req);
          keys(body2, ["expected_revision", "title", "body"]);
          if (!Number.isInteger(body2.expected_revision) || Number(body2.expected_revision) < 1) throw new ObjectHttpError(422, "INPUT_INVALID", "expected_revision is invalid");
          const result = options.storage.updateObject(current, objectId, Number(body2.expected_revision), { title: body2.title === void 0 ? void 0 : text(body2.title, "title", 200), body: body2.body === void 0 ? void 0 : text(body2.body, "body", 1e5) });
          if (result.kind === "session_expired") throw new ObjectHttpError(401, "SESSION_EXPIRED", "business session is required");
          if (result.kind === "not_found") throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          if (result.kind === "conflict") throw new ObjectHttpError(409, "REVISION_CONFLICT", "object revision has changed");
          json(res, 200, { data: safeObject(result.object), meta: { request_id: requestId, service_id: current.serviceId, server_time: result.object.updatedAt } });
          return;
        }
        if (segments.length === 4 && req.method === "DELETE") {
          if (!options.storage.deleteObject(current, objectId, now)) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          res.statusCode = 204;
          res.end();
          return;
        }
        if (segments.length === 5 && segments[4] === "action" && req.method === "POST") {
          const body2 = await readBody3(req);
          keys(body2, ["action"]);
          const wanted = action(body2.action);
          if (options.storage.authorizeObject(current, objectId, wanted, now) === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          json(res, 200, { data: { allowed: true, action: wanted, object_id: objectId }, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
      }
      if (segments[2] === "grants" && segments.length === 3 && req.method === "POST") {
        const body2 = await readBody3(req);
        keys(body2, ["object_id", "subject_type", "subject_id", "action", "valid_from", "expires_at"]);
        if (body2.subject_type !== "user" && body2.subject_type !== "project") throw new ObjectHttpError(422, "INPUT_INVALID", "subject_type is invalid");
        const grant = options.storage.grantObject(current, { id: randomUUID18(), objectId: text(body2.object_id, "object_id", 80), serviceId: current.serviceId, subjectType: body2.subject_type, subjectId: text(body2.subject_id, "subject_id", 80), action: action(body2.action), validFrom: body2.valid_from === void 0 ? now : text(body2.valid_from, "valid_from", 40), expiresAt: body2.expires_at === void 0 ? void 0 : text(body2.expires_at, "expires_at", 40), now });
        if (grant === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
        json(res, 201, { data: grant, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
        return;
      }
      if (segments[2] === "grants" && segments.length === 4 && segments[3] === "revoke" && req.method === "POST") {
        const body2 = await readBody3(req);
        keys(body2, ["grant_id", "id"]);
        const grantId = body2.grant_id ?? body2.id;
        if (grantId === void 0) throw new ObjectHttpError(422, "INPUT_INVALID", "grant_id is required");
        if (!options.storage.revokeGrant(current, text(grantId, "grant_id", 80), now)) throw new ObjectHttpError(404, "NOT_FOUND", "grant not found");
        res.statusCode = 204;
        res.end();
        return;
      }
      throw new ObjectHttpError(404, "NOT_FOUND", "route not found");
    } catch (error) {
      if (error instanceof JobError) {
        json(res, error.status, { code: error.code, request_id: requestId });
        return;
      }
      if (error instanceof ObjectHttpError) {
        json(res, error.status, { code: error.code, message: error.message, request_id: requestId, retryable: false, safe_details: {} });
        return;
      }
      if (error instanceof RecordsError) {
        json(res, 503, { code: error.code, message: "storage is unavailable", request_id: requestId, retryable: error.retryable, safe_details: {} });
        return;
      }
      json(res, 500, { code: "INTERNAL_ERROR", message: "internal error", request_id: requestId, retryable: false, safe_details: {} });
    }
  };
}

// src/host/ai-service.ts
import { randomUUID as randomUUID19 } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

// src/host/ai-tools.ts
import { createHash as createHash16 } from "node:crypto";
var AiError = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
    this.name = "AiError";
  }
};
var TOOL_NAMES = ["knowledgeos_read_object", "knowledgeos_update_object"];
var TOOL_SCHEMAS = [
  { name: TOOL_NAMES[0], description: "Read the specified existing KnowledgeOS test object. Server enforces the logged-in user permissions.", parameters: { type: "object", properties: { object_id: { type: "string" } }, required: ["object_id"], additionalProperties: false } },
  { name: TOOL_NAMES[1], description: "Update the specified existing KnowledgeOS test object at expected_revision. Supply title and/or body. Server enforces identity, permissions, revision and idempotency.", parameters: { type: "object", properties: { object_id: { type: "string" }, expected_revision: { type: "integer", minimum: 1 }, title: { type: "string", minLength: 1, maxLength: 200 }, body: { type: "string", maxLength: 2e3 } }, required: ["object_id", "expected_revision"], additionalProperties: false } }
];
function aiText(value, max2, empty = false) {
  if (typeof value !== "string" || !empty && value.length === 0 || value.length > max2 || !value.isWellFormed()) throw new AiError(422, "INPUT_INVALID");
  return value;
}
function onlyKeys(value, keys4) {
  if (Object.keys(value).some((key) => !keys4.includes(key))) throw new AiError(422, "INPUT_INVALID");
}
function toolArguments(call) {
  if (!TOOL_NAMES.includes(call.name)) throw new AiError(422, "TOOL_NOT_ALLOWED");
  if (call.arguments.length > 6e3) throw new AiError(422, "MODEL_OUTPUT_INVALID");
  let raw;
  try {
    raw = JSON.parse(call.arguments);
  } catch {
    throw new AiError(422, "MODEL_OUTPUT_INVALID");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AiError(422, "MODEL_OUTPUT_INVALID");
  const args2 = raw;
  onlyKeys(args2, call.name === TOOL_NAMES[0] ? ["object_id"] : ["object_id", "expected_revision", "title", "body"]);
  const object_id = aiText(args2.object_id, 80);
  if (call.name === TOOL_NAMES[0]) return { object_id };
  if (!Number.isSafeInteger(args2.expected_revision) || Number(args2.expected_revision) < 1 || args2.title === void 0 && args2.body === void 0) throw new AiError(422, "MODEL_OUTPUT_INVALID");
  return { object_id, expected_revision: Number(args2.expected_revision), ...args2.title === void 0 ? {} : { title: aiText(args2.title, 200) }, ...args2.body === void 0 ? {} : { body: aiText(args2.body, 2e3, true) } };
}
function toolDigest(name2, input) {
  return createHash16("sha256").update(JSON.stringify([name2, input.object_id, input.expected_revision ?? null, input.title ?? null, input.body ?? null])).digest("hex");
}
function runBusinessTool(store, actor2, call, key, now) {
  const input = toolArguments(call);
  if (call.name === TOOL_NAMES[0]) {
    const object2 = store.authorizeObject(actor2, input.object_id, "read", now);
    return object2 === void 0 ? { ok: false, status: 404, code: "NOT_FOUND" } : { ok: true, status: 200, code: "READ", object: object2 };
  }
  const result = store.mutateObjectOnce(actor2, { objectId: input.object_id, expectedRevision: input.expected_revision, title: input.title, body: input.body, key, digest: toolDigest(call.name, input) }, now);
  if (result.kind === "updated" || result.kind === "replayed") return { ok: true, status: 200, code: result.kind === "updated" ? "UPDATED" : "REPLAYED", object: result.object, replayed: result.kind === "replayed" };
  const errors = { not_found: [404, "NOT_FOUND"], session_expired: [401, "AUTH_REQUIRED"], conflict: [409, "REVISION_CONFLICT"], idempotency_conflict: [409, "IDEMPOTENCY_CONFLICT"] };
  const [status, code] = errors[result.kind];
  return { ok: false, status, code };
}

// src/host/ai-service.ts
var SYSTEM = "Choose exactly one provided KnowledgeOS tool for the user instruction. Use only the specified target object and revision. Do not invent identities, permissions, SQL, paths or commands. Reading uses knowledgeos_read_object. Updating title/body uses knowledgeos_update_object. Do not claim success; the server will execute the tool. Return one tool call.";
function modelFailure(error) {
  if (error instanceof AiError) return error;
  const e = error;
  const f = e?.failure ?? e ?? {}, code = String(f.code ?? ""), message = String(f.message ?? "").toLowerCase();
  if (["MISSING_CREDENTIAL", "NO_CREDENTIAL_STORE"].includes(code)) return new AiError(503, "CREDENTIALS_MISSING");
  if (/QUOTA|BALANCE/.test(code) || f.status === 402) return new AiError(429, "QUOTA_EXHAUSTED");
  if (f.status === 403 || /PERMISSION/.test(code)) return new AiError(403, "PROVIDER_PERMISSION_DENIED");
  if (f.status === 401 || /AUTH|CREDENTIAL|API_KEY/.test(code)) return new AiError(502, "CREDENTIALS_INVALID");
  if (f.status === 404 || /MODEL_NOT_FOUND|UNKNOWN_MODEL|MODEL_UNSUPPORTED/.test(code)) return new AiError(404, "MODEL_NOT_FOUND");
  if (/NO_ADAPTER/.test(code)) return new AiError(503, "MODEL_NOT_CONFIGURED");
  if (/TIMEOUT/.test(code)) return new AiError(504, "MODEL_TIMEOUT");
  if (/ABORT/.test(code)) return new AiError(409, "CANCELLED");
  if (f.status === 429 || /RATE_LIMIT/.test(code)) return new AiError(429, message.includes("insufficient_quota") ? "QUOTA_EXHAUSTED" : "PROVIDER_RATE_LIMITED");
  if (!code && /missing|not configured|no api key|credential.*required/.test(message) && /key|credential|auth/.test(message)) return new AiError(503, "CREDENTIALS_MISSING");
  return new AiError(502, "MODEL_FAILED");
}
var AiService = class {
  constructor(store, config, llm, tools) {
    this.store = store;
    this.config = config;
    this.llm = llm;
    this.tools = tools;
    for (const [value, min, max2, integer2] of [[config.maxCalls ?? 1, 1, Number.MAX_SAFE_INTEGER, true], [config.timeoutMs ?? 3e4, 100, 6e4, true], [config.budgetUsd ?? 0, 0, Number.MAX_VALUE, false]]) {
      if (!Number.isFinite(value) || value < min || value > max2 || integer2 && !Number.isSafeInteger(value)) throw new AiError(503, "AI_CONFIG_INVALID");
    }
    if (tools !== void 0) for (const schema of TOOL_SCHEMAS) this.#dispose.push(tools.register({
      ...schema,
      output: { schema: { type: "object" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
      execute: async (args2, exec) => {
        const bound = this.#scope.getStore();
        if (!bound || bound.call.id !== exec.callId || bound.call.name !== exec.name) return { ok: false, status: 403, code: "TOOL_CONTEXT_REQUIRED" };
        try {
          if (exec.signal.aborted) throw new AiError(409, "CANCELLED");
          const current = bound.actorNow();
          if (!current || current.sessionId !== bound.actor.sessionId || current.userId !== bound.actor.userId || current.serviceId !== bound.actor.serviceId) throw new AiError(401, "AUTH_REQUIRED");
          const call = { id: exec.callId, name: exec.name, arguments: JSON.stringify(args2) };
          if (toolDigest(call.name, toolArguments(call)) !== toolDigest(bound.call.name, toolArguments(bound.call))) throw new AiError(403, "TOOL_CONTEXT_REQUIRED");
          const result = runBusinessTool(this.store, current, call, bound.key, (/* @__PURE__ */ new Date()).toISOString());
          bound.onResult(result);
          return JSON.parse(JSON.stringify(result));
        } catch (error) {
          if (error instanceof AiError || error instanceof RecordsError) return { ok: false, status: error instanceof AiError ? error.status : 503, code: error.code };
          throw error;
        }
      }
    }));
  }
  #scope = new AsyncLocalStorage();
  #prepared = /* @__PURE__ */ new Map();
  #pending = /* @__PURE__ */ new Map();
  #calls = 0;
  #estimatedUsd = 0;
  #unknownCostCalls = 0;
  #inputTokens = 0;
  #outputTokens = 0;
  get routeAllowed() {
    return Boolean(this.config.provider && /^(?:deepseek[-/]|deepseek$)/i.test(this.config.model ?? ""));
  }
  #closed = false;
  #dispose = [];
  status() {
    return { provider: this.config.provider ?? null, model: this.config.model ?? null, configured: Boolean(this.routeAllowed && this.llm && this.tools), attempts: this.#calls, timeout_ms: this.config.timeoutMs ?? 3e4, budget_usd: this.config.budgetUsd ?? null, known_estimated_usd: this.#estimatedUsd, unknown_cost_calls: this.#unknownCostCalls, reported_input_tokens: this.#inputTokens, reported_output_tokens: this.#outputTokens, budget_warning: this.config.budgetUsd !== void 0 && this.#estimatedUsd > this.config.budgetUsd || this.config.maxCalls !== void 0 && this.#calls > this.config.maxCalls, state: this.#closed ? "stopped" : "ready" };
  }
  #sweep() {
    for (const [id4, item] of this.#prepared) if (Date.now() >= item.expiresAt && item.state !== "executing") this.#prepared.delete(id4);
  }
  async prepare(actor2, raw, signal) {
    onlyKeys(raw, ["request_id", "instruction", "object_id", "expected_revision", "idempotency_key"]);
    const instruction = aiText(raw.instruction, 2e3), objectId = aiText(raw.object_id, 80), requestId = aiText(raw.request_id, 80), key = aiText(raw.idempotency_key, 128);
    if (!Number.isSafeInteger(raw.expected_revision) || Number(raw.expected_revision) < 1) throw new AiError(422, "INPUT_INVALID");
    if (this.#closed || !this.llm || !this.tools || !this.routeAllowed || !this.config.provider || !this.config.model) throw new AiError(503, "MODEL_NOT_CONFIGURED");
    if (signal.aborted) throw new AiError(409, "CANCELLED");
    this.#sweep();
    if (this.#pending.has(requestId)) throw new AiError(409, "REQUEST_CONFLICT");
    if (this.#pending.size >= 4 || this.#prepared.size >= 100 || [...this.#pending.values()].some((p) => p.actor.userId === actor2.userId)) throw new AiError(429, "REQUEST_LIMIT");
    const controller = new AbortController();
    this.#pending.set(requestId, { actor: actor2, controller });
    const onAbort = () => controller.abort(new AiError(409, "CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new AiError(504, "MODEL_TIMEOUT")), this.config.timeoutMs ?? 3e4);
    let usage;
    let attempted = false;
    try {
      const available2 = this.llm.listProviders().some((p) => p.id === this.config.provider);
      if (!available2) throw new AiError(503, "MODEL_NOT_CONFIGURED");
      const catalog = await this.#abortable(this.llm.listModels(this.config.provider), controller.signal);
      if (catalog.length > 0 && !catalog.some((m) => m.id === this.config.model)) throw new AiError(404, "MODEL_NOT_FOUND");
      const userText = JSON.stringify({ instruction, target_object_id: objectId, expected_revision: raw.expected_revision });
      this.#calls++;
      attempted = true;
      const calls = [];
      let finish, outputBytes = 0;
      const stream = this.llm.stream({ provider: this.config.provider, model: this.config.model, system: SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: userText }] }], tools: TOOL_SCHEMAS, signal: controller.signal })[Symbol.asyncIterator]();
      try {
        while (true) {
          const next = await this.#abortable(stream.next(), controller.signal);
          if (next.done) break;
          const chunk2 = next.value;
          outputBytes += Buffer.byteLength(JSON.stringify(chunk2), "utf8");
          if (outputBytes > 96e3 || finish !== void 0) throw new AiError(502, "MODEL_OUTPUT_INVALID");
          if (chunk2.type === "block-end" && chunk2.block?.type === "tool-call") {
            const b = chunk2.block;
            if (!b.id || !b.name || typeof b.arguments !== "string") throw new AiError(502, "MODEL_OUTPUT_INVALID");
            calls.push({ id: b.id, name: b.name, arguments: b.arguments });
          }
          if (chunk2.type === "usage") usage = chunk2.usage;
          if (chunk2.type === "finish") {
            finish = chunk2.reason?.kind;
            if (controller.signal.aborted) throw controller.signal.reason;
            if (finish === "error" || finish === "aborted") throw modelFailure(chunk2.reason?.failure);
          }
        }
      } finally {
        if (controller.signal.aborted) void stream.return?.().catch(() => {
        });
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      if (finish !== "tool-calls" || calls.length !== 1) throw new AiError(502, "MODEL_OUTPUT_INVALID");
      const call = calls[0], args2 = toolArguments(call);
      if (args2.object_id !== objectId || call.name === TOOL_NAMES[1] && args2.expected_revision !== raw.expected_revision) throw new AiError(422, "MODEL_TARGET_MISMATCH");
      const prepared = { id: randomUUID19(), requestId, actor: actor2, key, call, expiresAt: Date.now() + 12e4, state: "prepared" };
      this.#prepared.set(prepared.id, prepared);
      return { ...this.#view(prepared), usage: usage ?? null };
    } catch (error) {
      throw controller.signal.aborted ? controller.signal.reason : modelFailure(error);
    } finally {
      if (attempted) {
        const counts = usage;
        const input = counts?.inputTokens, output = counts?.outputTokens;
        const valid2 = (x) => x !== void 0 && Number.isFinite(x) && x >= 0;
        if (valid2(input)) this.#inputTokens += input;
        if (valid2(output)) this.#outputTokens += output;
        if (valid2(input) && valid2(output) && valid2(this.config.inputUsdPerMillion) && valid2(this.config.outputUsdPerMillion)) this.#estimatedUsd += (input * this.config.inputUsdPerMillion + output * this.config.outputUsdPerMillion) / 1e6;
        else this.#unknownCostCalls++;
      }
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      this.#pending.delete(requestId);
    }
  }
  async #abortable(pending, signal) {
    if (signal.aborted) throw signal.reason;
    return await new Promise((resolve2, reject2) => {
      const abort = () => reject2(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      pending.then(resolve2, reject2).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  #view(item) {
    return { prepared_id: item.id, request_id: item.requestId, provider: this.config.provider, model: this.config.model, state: item.state, tool: item.call.name, arguments: toolArguments(item.call), expires_at: new Date(item.expiresAt).toISOString() };
  }
  cancel(actor2, requestId) {
    const pending = this.#pending.get(requestId);
    if (pending && pending.actor.sessionId === actor2.sessionId) pending.controller.abort(new AiError(409, "CANCELLED"));
    for (const item of this.#prepared.values()) if (item.requestId === requestId && item.actor.sessionId === actor2.sessionId) {
      if (item.state === "executing") {
        if (item.committed) throw new AiError(409, "OPERATION_ALREADY_COMPLETED");
        item.execution?.abort(new AiError(409, "CANCELLED"));
      }
      if (item.state === "succeeded") throw new AiError(409, "OPERATION_ALREADY_COMPLETED");
      if (item.state === "prepared") {
        item.state = "failed";
        item.result = { ok: false, status: 409, code: "CANCELLED" };
      }
    }
  }
  async execute(actor2, actorNow, id4, signal) {
    this.#sweep();
    const item = this.#prepared.get(id4);
    if (this.#closed || !item || item.actor.sessionId !== actor2.sessionId || item.actor.userId !== actor2.userId) throw new AiError(404, "PREPARED_NOT_FOUND");
    if (signal.aborted) throw new AiError(409, "CANCELLED");
    if (item.state === "executing") throw new AiError(409, "REQUEST_IN_PROGRESS");
    if (item.state === "failed") throw new AiError(item.result?.status ?? 409, item.result?.code ?? "REQUEST_FAILED");
    item.state = "executing";
    const controller = new AbortController();
    item.execution = controller;
    item.committed = false;
    const abort = () => controller.abort(new AiError(409, "CANCELLED"));
    signal.addEventListener("abort", abort, { once: true });
    try {
      const batch = await this.#scope.run({ actor: actor2, actorNow, key: item.key, call: item.call, onResult: (result2) => {
        if (result2.ok && item.call.name === TOOL_NAMES[1]) item.committed = true;
      } }, () => this.tools.execute({ calls: [{ type: "tool-call", ...item.call }], signal: controller.signal, maxParallelToolCalls: 1 }));
      const response = batch.results[0];
      if (controller.signal.aborted) throw new AiError(409, item.committed ? "OPERATION_ALREADY_COMPLETED" : "CANCELLED");
      if (batch.results.length !== 1 || response?.callId !== item.call.id) throw new AiError(502, "TOOL_FAILED");
      if (response.result.isError) {
        const code = response.result.error?.info?.code ?? "";
        if (/ABORT|CANCEL/.test(code)) throw new AiError(409, item.committed ? "OPERATION_ALREADY_COMPLETED" : "CANCELLED");
        if (code === "TOOL_TIMEOUT") throw new AiError(504, "TOOL_TIMEOUT");
        if (["STORAGE_BUSY", "STORAGE_UNAVAILABLE"].includes(code)) throw new AiError(503, code);
        throw new AiError(502, "TOOL_FAILED");
      }
      const result = JSON.parse(response.result.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""));
      if (typeof result.ok !== "boolean" || !Number.isInteger(result.status) || typeof result.code !== "string") throw new AiError(502, "TOOL_FAILED");
      const current = actorNow();
      if (!current || current.sessionId !== actor2.sessionId || current.userId !== actor2.userId || current.serviceId !== actor2.serviceId) throw new AiError(401, "AUTH_REQUIRED");
      if (result.ok && !this.store.authorizeObject(current, toolArguments(item.call).object_id, "read", (/* @__PURE__ */ new Date()).toISOString())) throw new AiError(404, "NOT_FOUND");
      item.result = result;
      item.state = result.ok ? "succeeded" : "failed";
      if (!result.ok) throw new AiError(result.status, result.code);
      return { ...this.#view(item), result };
    } catch (error) {
      item.state = "failed";
      const safe = error instanceof AiError ? error : new AiError(502, "TOOL_FAILED");
      item.result = { ok: false, status: safe.status, code: safe.code };
      throw safe;
    } finally {
      signal.removeEventListener("abort", abort);
      delete item.execution;
    }
  }
  close() {
    this.#closed = true;
    for (const { controller } of this.#pending.values()) controller.abort(new AiError(409, "CANCELLED"));
    for (const item of this.#prepared.values()) item.execution?.abort(new AiError(409, "CANCELLED"));
    this.#prepared.clear();
    for (const dispose of this.#dispose) dispose();
  }
};

// src/host/ai-http.ts
import { randomUUID as randomUUID20 } from "node:crypto";
function createAiHandler(options) {
  return async (req, res) => {
    const requestId = randomUUID20(), controller = new AbortController();
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once("aborted", disconnect);
    res.once("close", disconnect);
    const send = (status, data) => {
      if (res.destroyed) return;
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-content-type-options", "nosniff");
      res.end(JSON.stringify(data));
    };
    try {
      const origin = options.origin();
      if (!origin || req.headers.host !== new URL(origin).host || req.headers.origin !== void 0 && req.headers.origin !== origin || req.headers["sec-fetch-site"] === "cross-site" || req.method !== "GET" && req.headers["x-knowledgeos-request"] !== "1") throw new AiError(403, "CSRF_REJECTED");
      const url = new URL(req.url ?? "/", origin);
      if (url.search) throw new AiError(422, "INPUT_INVALID");
      const actorNow = () => options.actorFor(req);
      const actor2 = actorNow();
      if (!actor2) throw new AiError(401, "AUTH_REQUIRED");
      const service = options.service();
      if (req.method === "GET" && url.pathname === "/knowledge/v1/ai/status") {
        send(200, { data: service.status(), meta: { request_id: requestId } });
        return;
      }
      if (req.method !== "POST" || !["/knowledge/v1/ai/prepare", "/knowledge/v1/ai/execute", "/knowledge/v1/ai/cancel"].includes(url.pathname)) throw new AiError(404, "NOT_FOUND");
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new AiError(415, "CONTENT_TYPE_INVALID");
      const chunks = [];
      let bytes = 0;
      for await (const raw of req) {
        const chunk2 = Buffer.from(raw);
        bytes += chunk2.length;
        if (bytes > 16384) throw new AiError(413, "PAYLOAD_TOO_LARGE");
        chunks.push(chunk2);
      }
      let body2;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        body2 = value;
      } catch {
        throw new AiError(400, "INVALID_JSON");
      }
      const current = actorNow();
      if (!current || current.sessionId !== actor2.sessionId) throw new AiError(401, "AUTH_REQUIRED");
      if (url.pathname.endsWith("/prepare")) {
        send(200, { data: await service.prepare(current, body2, controller.signal), meta: { request_id: requestId } });
        return;
      }
      if (url.pathname.endsWith("/execute")) {
        onlyKeys(body2, ["prepared_id"]);
        send(200, { data: await service.execute(current, actorNow, aiText(body2.prepared_id, 80), controller.signal), meta: { request_id: requestId } });
        return;
      }
      onlyKeys(body2, ["request_id"]);
      service.cancel(current, aiText(body2.request_id, 80));
      send(200, { data: { state: "cancelled" }, meta: { request_id: requestId } });
    } catch (error) {
      const safe = error instanceof AiError ? error : error instanceof RecordsError ? new AiError(503, error.code) : new AiError(500, "INTERNAL_ERROR");
      send(safe.status, { code: safe.code, message: safe.code, request_id: requestId, retryable: ["MODEL_TIMEOUT", "STORAGE_BUSY", "PROVIDER_RATE_LIMITED"].includes(safe.code), safe_details: {} });
    } finally {
      req.removeListener("aborted", disconnect);
      res.removeListener("close", disconnect);
    }
  };
}

// src/host/ai-page.ts
function buildAiHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \xB7 \u53D7\u63A7 AI \u5DE5\u5177</title><style>
body{margin:0;background:#f4f8f8;color:#23333a;font:15px/1.65 "Segoe UI","Microsoft YaHei UI",sans-serif}main{max-width:860px;margin:auto;padding:30px 20px}.card{background:white;border:1px solid #dce8e9;border-radius:14px;padding:22px;margin:16px 0}label{display:block;margin:12px 0 4px}input,select,textarea{width:100%;box-sizing:border-box;font:inherit;padding:9px;border:1px solid #bbcfd2;border-radius:7px}textarea{min-height:90px}button{background:#3d7e86;color:white;border:0;border-radius:7px;padding:10px 15px;font:inherit;margin:12px 8px 0 0;cursor:pointer}button:disabled{opacity:.5;cursor:default}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#356f76}#status{font-weight:600}small{color:#597078}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #356f76;outline-offset:2px}</style></head><body><main>
<a href="/knowledgeos/account">\u8D26\u53F7\u4E0E\u767B\u5F55</a><h1>KnowledgeOS \xB7 \u53D7\u63A7 AI \u5DE5\u5177</h1><p id="who">\u6B63\u5728\u6838\u5BF9\u767B\u5F55\u2026</p>
<section class="card"><h2>\u6A21\u578B\u4E0E\u8BF7\u6C42</h2><p id="model">\u6B63\u5728\u8BFB\u53D6\u6A21\u578B\u914D\u7F6E\u2026</p><small id="budget"></small><p id="status" role="status" aria-live="polite">\u7B49\u5F85\u767B\u5F55</p></section>
<section class="card"><h2>\u6D4B\u8BD5\u77E5\u8BC6\u5BF9\u8C61</h2><label for="objects">\u9009\u62E9\u6709\u6743\u8BFB\u53D6\u7684\u5BF9\u8C61</label><select id="objects"></select><button id="refresh">\u5237\u65B0\u5BF9\u8C61\u5217\u8868</button><button id="read">\u91CD\u65B0\u8BFB\u53D6\u9A8C\u8BC1</button><pre id="object"></pre></section>
<section class="card"><h2>\u81EA\u7136\u8BED\u8A00\u64CD\u4F5C</h2><label for="target">\u76EE\u6807\u5BF9\u8C61 ID</label><input id="target"><label for="revision">\u9884\u671F\u7248\u672C expected_revision</label><input id="revision" type="number" min="1" value="1"><label for="key">\u64CD\u4F5C\u5E42\u7B49\u952E\uFF08\u91CD\u8BD5\u65F6\u4FDD\u6301\u76F8\u540C\uFF09</label><input id="key"><label for="instruction">\u6307\u4EE4</label><textarea id="instruction" placeholder="\u8BFB\u53D6\u8FD9\u4E2A\u5BF9\u8C61\uFF0C\u6216\u628A\u6807\u9898\u6539\u4E3A\u2026\u2026"></textarea><button id="prepare" disabled>\u63D0\u4EA4\u7ED9\u6A21\u578B</button><button id="execute" disabled>\u6267\u884C\u5DF2\u51C6\u5907\u5DE5\u5177</button><button id="cancel" disabled>\u53D6\u6D88\u8BF7\u6C42</button><pre id="tool"></pre><pre id="result"></pre></section>
</main><script>(()=>{const $=id=>document.getElementById(id);let prepared=null,requestId=null,busy=false,generation=0,userId=null,authenticated=false,configured=false;const state=t=>{$('status').textContent=t};const call=async(path,options={})=>{const r=await fetch(path,{...options,headers:{'content-type':'application/json','x-knowledgeos-request':'1'}});const j=await r.json();if(!r.ok){const e=new Error(j.code||('HTTP_'+r.status));e.status=r.status;throw e}return j.data};const post=(path,b)=>call(path,{method:'POST',body:JSON.stringify(b)});const clear=()=>{requestId=null;prepared=null;$('cancel').disabled=true;$('execute').disabled=true;$('object').textContent='';$('tool').textContent='';$('result').textContent='';$('objects').replaceChildren();$('target').value=''};const fail=e=>{state('\u5931\u8D25 \xB7 '+e.message);if(e.status===401){authenticated=false;generation++;clear();$('prepare').disabled=true;$('who').textContent='\u4E1A\u52A1\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55'}};const accept=async gen=>{if(gen!==generation)return false;try{const me=await call('/knowledge/v1/me');if(gen!==generation)return false;if(me.id!==userId){await load();return false}return true}catch(e){if(gen===generation)fail(e);return false}};const read=async()=>{const gen=generation,id=$('target').value;try{const object=await call('/knowledge/v1/objects/'+encodeURIComponent(id));if(!await accept(gen))return;$('object').textContent=JSON.stringify(object,null,2);$('revision').value=object.revision;const op=Array.from($('objects').options).find(o=>o.value===object.id);if(op){op.dataset.revision=String(object.revision);op.textContent=object.title+' \xB7 revision '+object.revision}state('\u91CD\u65B0\u8BFB\u53D6\u5B8C\u6210 \xB7 revision '+object.revision)}catch(e){if(gen===generation)fail(e)}};const list=async(previous)=>{const gen=generation;const objects=await call('/knowledge/v1/objects');if(!await accept(gen))return;$('objects').replaceChildren();for(const o of objects){const op=document.createElement('option');op.value=o.id;op.dataset.revision=String(o.revision);op.textContent=o.title+' \xB7 revision '+o.revision;$('objects').append(op)}const selected=objects.find(o=>o.id===previous)||objects[0];$('objects').value=selected?.id||'';$('target').value=selected?.id||'';$('revision').value=selected?.revision||1};const invalidateTarget=()=>{const oldRequest=requestId;if(oldRequest)void post('/knowledge/v1/ai/cancel',{request_id:oldRequest}).catch(()=>{});generation++;busy=false;prepared=null;requestId=null;$('execute').disabled=true;$('cancel').disabled=true;$('prepare').disabled=!authenticated||!configured;$('object').textContent='';$('tool').textContent='';$('result').textContent='';state(configured?'\u76EE\u6807\u6216\u8349\u7A3F\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u65B0\u63D0\u4EA4':'BLOCKED \xB7 MODEL_NOT_CONFIGURED')};$('objects').onchange=()=>{invalidateTarget();$('target').value=$('objects').value;$('revision').value=$('objects').selectedOptions[0]?.dataset.revision||'1'};for(const id of ['target','revision','key','instruction'])$(id).addEventListener('input',invalidateTarget);$('read').onclick=read;$('refresh').onclick=()=>{const previous=$('target').value;invalidateTarget();const gen=generation;list(previous).catch(e=>{if(gen===generation)fail(e)})};$('key').value=crypto.randomUUID();$('prepare').onclick=async()=>{if(busy||!authenticated||!configured)return;busy=true;const gen=generation;prepared=null;requestId=crypto.randomUUID();$('prepare').disabled=true;$('execute').disabled=true;$('cancel').disabled=false;$('tool').textContent='';$('result').textContent='';state('\u6A21\u578B\u8BF7\u6C42\u4E2D');try{const p=await post('/knowledge/v1/ai/prepare',{request_id:requestId,instruction:$('instruction').value,object_id:$('target').value,expected_revision:Number($('revision').value),idempotency_key:$('key').value});if(!await accept(gen))return;prepared=p;$('tool').textContent='\u6240\u7528\u5DE5\u5177\uFF1A'+p.tool+'\\n'+JSON.stringify(p.arguments,null,2);$('execute').disabled=false;state('\u5DF2\u51C6\u5907 \xB7 '+p.provider+' / '+p.model)}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('prepare').disabled=!authenticated||!configured;$('cancel').disabled=prepared===null}}};$('execute').onclick=async()=>{if(!prepared||busy)return;const gen=generation;busy=true;$('execute').disabled=true;state('\u6B63\u5728\u91CD\u65B0\u5224\u6743\u5E76\u6267\u884C');try{const d=await post('/knowledge/v1/ai/execute',{prepared_id:prepared.prepared_id});if(!await accept(gen))return;$('result').textContent=JSON.stringify(d.result,null,2);state('\u6267\u884C\u6210\u529F \xB7 '+d.result.code+' \xB7 revision '+d.result.object.revision)}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('cancel').disabled=true}}};$('cancel').onclick=async()=>{if(!requestId)return;const id=requestId,gen=++generation;prepared=null;$('execute').disabled=true;$('cancel').disabled=true;try{await post('/knowledge/v1/ai/cancel',{request_id:id});if(gen===generation)state('\u5DF2\u53D6\u6D88')}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('prepare').disabled=!authenticated||!configured}}};const load=async()=>{const gen=++generation;busy=false;authenticated=false;clear();$('prepare').disabled=true;try{const me=await call('/knowledge/v1/me');const m=await call('/knowledge/v1/ai/status');if(gen!==generation)return;userId=me.id;authenticated=true;configured=m.configured;$('who').textContent='\u5DF2\u767B\u5F55 \xB7 '+me.display_name+'\uFF08'+me.login_name+'\uFF09';$('model').textContent='\u6A21\u578B\uFF1A'+(m.provider||'\u672A\u914D\u7F6E')+' / '+(m.model||'\u672A\u914D\u7F6E');$('budget').textContent='\u5DF2\u5C1D\u8BD5 '+m.attempts+' \u6B21 \xB7 \u5DF2\u62A5\u544A\u7528\u91CF '+m.reported_input_tokens+' / '+m.reported_output_tokens+' tokens \xB7 \u8D39\u7528\u672A\u77E5 '+m.unknown_cost_calls+' \u6B21'+(m.budget_warning?' \xB7 \u5DF2\u8D85\u8FC7\u63D0\u9192\u9608\u503C':'');await list();if(gen!==generation)return;$('prepare').disabled=!m.configured;state(m.configured?'\u5C31\u7EEA':'BLOCKED \xB7 MODEL_NOT_CONFIGURED')}catch(e){if(gen===generation)fail(e)}};document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void load()});void load()})()</script></body></html>`;
}

// src/host/index.ts
import { join as join3 } from "node:path";

// src/host/pdf-originals.ts
import { createHash as createHash17, randomUUID as randomUUID21 } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join as join2, resolve } from "node:path";

// src/host/word-original.ts
import { crc32, createInflateRaw, inflateRaw } from "node:zlib";
import { promisify } from "node:util";
var WordInputError = class extends Error {
  constructor() {
    super("INVALID_WORD");
  }
};
var invalid6 = () => {
  throw new WordInputError();
};
var isWordMedia = (media) => media === WORD_MEDIA.docx || media === WORD_MEDIA.doc;
function checkWordEnvelope(b, media) {
  if (media === WORD_MEDIA.doc) {
    if (b.length < 512 || b.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1" || b.readUInt16LE(28) !== 65534 || ![9, 12].includes(b.readUInt16LE(30))) invalid6();
    return [];
  }
  if (b.length < 22 || b.readUInt32LE(0) !== 67324752) invalid6();
  let e = b.length - 22;
  const floor = Math.max(0, e - 65535);
  while (e >= floor && (b.readUInt32LE(e) !== 101010256 || e + 22 + b.readUInt16LE(e + 20) !== b.length)) e--;
  if (e < floor || b.readUInt32LE(e + 4) !== 0) invalid6();
  const entries = b.readUInt16LE(e + 10), length = b.readUInt32LE(e + 12);
  let pos = b.readUInt32LE(e + 16), expanded = 0;
  if (!entries || entries > 8192 || entries !== b.readUInt16LE(e + 8) || pos + length !== e) invalid6();
  const central = pos, names = /* @__PURE__ */ new Set(), members = [];
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > e || b.readUInt32LE(pos) !== 33639248) invalid6();
    const n = b.readUInt16LE(pos + 28), next = pos + 46 + n + b.readUInt16LE(pos + 30) + b.readUInt16LE(pos + 32), local = b.readUInt32LE(pos + 42);
    if (!n || next > e || local + 30 > central || b.readUInt32LE(local) !== 67324752 || b.readUInt16LE(pos + 34) !== 0) invalid6();
    const name2 = b.subarray(pos + 46, pos + 46 + n), key = name2.toString("utf8"), start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    if (b.readUInt16LE(local + 26) !== n || !name2.equals(b.subarray(local + 30, local + 30 + n)) || names.has(key) || start + b.readUInt32LE(pos + 20) > central) invalid6();
    if (b.readUInt16LE(pos + 8) & 1 || b.readUInt16LE(local + 6) & 1 || ![0, 8].includes(b.readUInt16LE(pos + 10)) || b.readUInt16LE(local + 8) !== b.readUInt16LE(pos + 10)) invalid6();
    expanded += b.readUInt32LE(pos + 24);
    if (expanded > 256 * 1024 * 1024) invalid6();
    members.push({ name: key, start, packed: b.readUInt32LE(pos + 20), size: b.readUInt32LE(pos + 24), method: b.readUInt16LE(pos + 10), crc: b.readUInt32LE(pos + 16) });
    names.add(key);
    pos = next;
  }
  if (pos !== e || !["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every((k) => names.has(k))) invalid6();
  return members;
}
var inflate = promisify(inflateRaw);
async function wordBodyXml(bytes) {
  const m = checkWordEnvelope(bytes, WORD_MEDIA.docx).find((m2) => m2.name === "word/document.xml");
  if (!m || m.size < 1 || m.size > 4 * 1024 * 1024) return invalid6();
  const packed = bytes.subarray(m.start, m.start + m.packed);
  const body2 = m.method ? await inflate(packed, { maxOutputLength: m.size }) : packed;
  if (body2.length !== m.size || crc32(body2) !== m.crc) return invalid6();
  return new TextDecoder("utf-8", { fatal: true }).decode(body2);
}
async function verifyWordBytes(b, media) {
  const members = checkWordEnvelope(b, media);
  let remaining = 256 * 1024 * 1024;
  for (const m of members) {
    const packed = b.subarray(m.start, m.start + m.packed);
    if (!m.method) {
      if (m.packed !== m.size || m.size > remaining || crc32(packed) !== m.crc) invalid6();
      remaining -= m.size;
      continue;
    }
    const decoder = createInflateRaw({ chunkSize: 32768 });
    let actual = 0, crc = 0;
    try {
      decoder.end(packed);
      for await (const chunk2 of decoder) {
        actual += chunk2.length;
        remaining -= chunk2.length;
        if (actual > m.size || remaining < 0) invalid6();
        crc = crc32(chunk2, crc);
      }
      if (actual !== m.size || crc !== m.crc || decoder.bytesWritten !== m.packed) invalid6();
    } catch {
      invalid6();
    } finally {
      decoder.destroy();
    }
  }
}

// src/host/pdf-originals.ts
var MAX = 64 * 1024 * 1024;
var KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|txt|docx?|zip)$/;
var digest3 = (b) => createHash17("sha256").update(b).digest("hex");
var PdfInputError = class extends Error {
  code = "PDF_INVALID_INPUT";
  constructor() {
    super("Invalid PDF envelope");
    this.name = "PdfInputError";
    this.stack = `${this.name}: ${this.message}`;
  }
};
var PdfStorageError = class extends Error {
  code = "PDF_ORIGINAL_UNAVAILABLE";
  constructor() {
    super("PDF original unavailable");
    this.name = "PdfStorageError";
    this.stack = `${this.name}: ${this.message}`;
  }
};
var invalid7 = () => new PdfInputError();
var unavailable2 = () => new PdfStorageError();
function xrefStream(head) {
  const obj = /^[1-9]\d*[ \t\r\n]+\d+[ \t\r\n]+obj[ \t\r\n]*<</.exec(head);
  if (!obj) return false;
  const token2 = /[\x00\t\n\f\r ]+|%[^\r\n]*|<<|>>|\[|\]|\(|<[\da-fA-F\x00\t\n\f\r ]*>|\/?[^\x00\t\n\f\r ()<>\[\]\/%]+/y;
  token2.lastIndex = obj[0].length;
  const ends = [">>"];
  let type = false, found = false;
  for (let m; m = token2.exec(head); ) {
    const s = m[0];
    if (/^[%\x00\t\n\f\r ]/.test(s)) continue;
    if (ends.length === 1 && type && s === "/XRef") found = true;
    type = ends.length === 1 && s === "/Type";
    if (s === "<<" || s === "[") ends.push(s === "<<" ? ">>" : "]");
    else if (s === ">>" || s === "]") {
      if (ends.pop() !== s) return false;
      if (!ends.length) return found && /^[ \t\r\n]*stream(?:\r\n|\n)/.test(head.slice(token2.lastIndex));
    } else if (s === "(") {
      let depth = 1, pos = token2.lastIndex;
      while (depth && pos < head.length) {
        const ch = head[pos++];
        if (ch === "\\") pos++;
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      token2.lastIndex = pos;
    }
  }
  return false;
}
function checkEnvelope(b) {
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(b.toString("latin1", 0, 10))) throw invalid7();
  const tail = Math.max(0, b.length - 4096);
  const footer = /[\r\n]startxref[ \t]*[\r\n]+[ \t]*(\d{1,16})[ \t]*[\r\n]+%%EOF[\x00\t\n\f\r ]*$/.exec(b.toString("latin1", tail));
  if (!footer) throw invalid7();
  const offset = Number(footer[1]), end = tail + footer.index;
  if (offset < 9 || offset >= end || !/[\x00\t\n\f\r ]/.test(String.fromCharCode(b[offset - 1]))) throw invalid7();
  const head = b.toString("latin1", offset, Math.min(end, offset + 16384));
  if (/^xref[ \t\r\n]+\d+[ \t]+[1-9]\d*[ \t]*[\r\n]+\d{10} \d{5} [nf](?=[ \t\r\n])/.test(head)) return;
  if (!xrefStream(head)) throw invalid7();
}
var statOpts = { bigint: true };
var same = (a, b) => a.ino !== 0n && a.ino === b.ino && a.dev === b.dev && a.birthtimeNs === b.birthtimeNs;
var hasCode = (e, code) => e?.code === code;
var noFollow = constants.O_NOFOLLOW ?? 0;
async function syncDirectory(path2) {
  if (process.platform === "win32") return;
  const dir = await fs.open(path2, constants.O_RDONLY | constants.O_DIRECTORY | noFollow);
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
async function checkedDirectory(path2, create) {
  let stat;
  try {
    stat = await fs.lstat(path2, statOpts);
  } catch (e) {
    if (!create || !hasCode(e, "ENOENT") || dirname(path2) === path2) throw e;
    const parent = dirname(path2);
    await checkedDirectory(parent, true);
    try {
      await fs.mkdir(path2, { mode: 448 });
    } catch (e2) {
      if (!hasCode(e2, "EEXIST")) throw e2;
    }
    await syncDirectory(parent);
    stat = await fs.lstat(path2, statOpts);
  }
  if (!stat.isDirectory() || stat.ino === 0n || await fs.realpath(path2) !== path2) throw unavailable2();
  return stat;
}
var PdfOriginals = class {
  #root;
  #rootId;
  #pending = /* @__PURE__ */ new Map();
  constructor(rootDir) {
    if (typeof rootDir !== "string" || !rootDir) throw unavailable2();
    this.#root = resolve(rootDir);
    if (process.platform === "win32" && !/^[A-Za-z]:\\/.test(this.#root)) throw unavailable2();
  }
  async #directory(create = false) {
    const stat = await checkedDirectory(this.#root, create && !this.#rootId);
    if (this.#rootId && !same(this.#rootId, stat)) throw unavailable2();
    this.#rootId = stat;
  }
  async #file(path2) {
    const stat = await fs.lstat(path2, statOpts);
    if (!stat.isFile() || stat.ino === 0n || await fs.realpath(path2) !== path2) throw unavailable2();
    return stat;
  }
  async #unlinkOwned(path2, id4, stillOwned = () => true) {
    await this.#directory();
    const stat = await this.#file(path2);
    if (!same(id4, stat)) throw unavailable2();
    if (stillOwned()) await fs.unlink(path2);
  }
  async put(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw invalid7();
    const data = Buffer.from(bytes);
    checkEnvelope(data);
    try {
      return await this.#write(data, "pdf");
    } catch {
      throw unavailable2();
    }
  }
  async putText(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw unavailable2();
    try {
      return await this.#write(Buffer.from(bytes), "txt");
    } catch {
      throw unavailable2();
    }
  }
  async putWord(bytes, media) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw unavailable2();
    const data = Buffer.from(bytes);
    await verifyWordBytes(data, media);
    try {
      return await this.#write(data, media === WORD_MEDIA.doc ? "doc" : "docx");
    } catch {
      throw unavailable2();
    }
  }
  async putArchive(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw unavailable2();
    try {
      return await this.#write(Buffer.from(bytes), "zip");
    } catch {
      throw unavailable2();
    }
  }
  async #write(data, extension) {
    const sha256 = digest3(data);
    await this.#directory(true);
    const stage = join2(this.#root, `.${randomUUID21()}.pending`);
    const key = `${randomUUID21()}.${extension}`, final = join2(this.#root, key);
    const file = await fs.open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 384);
    let id4, staged = true, linked = false;
    try {
      try {
        id4 = await file.stat(statOpts);
        await file.writeFile(data);
        if ((await file.stat(statOpts)).size !== BigInt(data.length)) throw unavailable2();
        await file.sync();
        await this.#directory();
        if (!same(id4, await this.#file(stage))) throw unavailable2();
        await fs.link(stage, final);
        linked = true;
        await this.#unlinkOwned(stage, id4);
        staged = false;
        await file.sync();
        const published = await this.#file(final);
        if (!same(id4, published) || published.nlink !== 1n || published.size !== BigInt(data.length)) throw unavailable2();
      } finally {
        await file.close();
      }
      await syncDirectory(this.#root);
      this.#pending.set(key, { id: id4, discarding: false });
      return { key, sha256, byteLength: data.length };
    } catch (failure) {
      if (id4 && linked) await this.#unlinkOwned(final, id4);
      if (id4 && staged) await this.#unlinkOwned(stage, id4);
      throw failure;
    }
  }
  async read(key, expectedSha, expectedSize) {
    try {
      if (typeof key !== "string" || key.length !== (key.endsWith(".docx") ? 41 : 40) || !KEY.test(key) || typeof expectedSha !== "string" || expectedSha.length !== 64 || !/^[0-9a-f]+$/.test(expectedSha) || !Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX) throw unavailable2();
      await this.#directory();
      const path2 = join2(this.#root, key), before = await this.#file(path2);
      if (before.nlink !== 1n || before.size !== BigInt(expectedSize)) throw unavailable2();
      const file = await fs.open(path2, constants.O_RDONLY | noFollow | (constants.O_NONBLOCK ?? 0));
      try {
        const stat = await file.stat(statOpts);
        if (!same(before, stat) || stat.size !== before.size || stat.nlink !== 1n) throw unavailable2();
        const data = Buffer.allocUnsafe(expectedSize);
        for (let pos = 0; pos < expectedSize; ) {
          const { bytesRead } = await file.read(data, pos, expectedSize - pos, pos);
          if (!bytesRead) throw unavailable2();
          pos += bytesRead;
        }
        await this.#directory();
        const after = await this.#file(path2);
        if (!same(stat, after) || after.size !== stat.size || after.nlink !== 1n || digest3(data) !== expectedSha) throw unavailable2();
        if (key.endsWith(".pdf")) checkEnvelope(data);
        return data;
      } finally {
        await file.close();
      }
    } catch {
      throw unavailable2();
    }
  }
  /** Surrender this instance's rollback permission. No I/O and safe to repeat. */
  retain(key) {
    this.#pending.delete(key);
  }
  async discard(key) {
    const entry = this.#pending.get(key);
    if (!entry || entry.discarding) return;
    entry.discarding = true;
    try {
      await this.#unlinkOwned(join2(this.#root, key), entry.id, () => this.#pending.get(key) === entry);
      await syncDirectory(this.#root);
    } catch (e) {
      if (!hasCode(e, "ENOENT")) throw unavailable2();
    } finally {
      entry.discarding = false;
    }
    this.#pending.delete(key);
  }
};

// src/host/library-http.ts
import { randomUUID as randomUUID22 } from "node:crypto";

// src/host/text-document.ts
import { createHash as createHash18 } from "node:crypto";
var MAX_BYTES = 8 * 1024 * 1024;
var MAX_BLOCKS = 16384;
var messages = {
  TEXT_INVALID_INPUT: "Expected text bytes and a supported text media type",
  TEXT_TOO_LARGE: "Text exceeds the byte or structural block limit",
  TEXT_UNSUPPORTED_ENCODING: "Unsupported text encoding",
  TEXT_INVALID_ENCODING: "Invalid text bytes or conflicting byte order mark",
  TEXT_BINARY: "Unexpected binary control character in text"
};
var TextInputError = class extends Error {
  code;
  constructor(code) {
    super(messages[code]);
    this.name = "TextInputError";
    this.code = code;
  }
};
function bomEncoding(bytes) {
  const [a, b, c, d] = bytes;
  if (a === 255 && b === 254 && c === 0 && d === 0 || a === 0 && b === 0 && c === 254 && d === 255) throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  if (a === 255 && b === 254) return "utf-16le";
  if (a === 254 && b === 255) return "utf-16be";
  if (a === 239 && b === 187 && c === 191) return "utf-8";
}
function selectEncoding(bom, requested) {
  if (requested === void 0) return bom ?? "utf-8";
  if (typeof requested !== "string" || requested.length > 64) throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  const label = requested.trim().toLowerCase();
  const enc = label === "utf8" ? "utf-8" : label;
  if (enc !== "utf-8" && enc !== "utf-16le" && enc !== "utf-16be" && enc !== "gb18030")
    throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  if (bom && bom !== enc) throw new TextInputError("TEXT_INVALID_ENCODING");
  return enc;
}
function indexBlocks(source, markdown) {
  const blocks = [];
  let start = 0, pending, fence = "";
  function flush(end) {
    if (!pending) return;
    if (blocks.length >= MAX_BLOCKS) throw new TextInputError("TEXT_TOO_LARGE");
    const text2 = source.slice(start, end);
    const anchor = createHash18("sha256").update(text2, "utf8").digest("hex");
    blocks.push({ kind: pending, start, end, text: text2, anchor });
    start = end;
    pending = void 0;
  }
  for (let pos = 0; pos < source.length; ) {
    let eol = pos;
    while (eol < source.length && source.charCodeAt(eol) !== 10 && source.charCodeAt(eol) !== 13) eol++;
    let end = eol;
    if (source[end] === "\r") end++;
    if (source[end] === "\n") end++;
    const line = source.slice(pos, eol);
    const marker = markdown ? /^ {0,3}(`{3,}|~{3,})/.exec(line) : null;
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && /^[ \t]*$/.test(line.slice(marker[0].length))) {
        flush(end);
        fence = "";
      }
    } else if (marker && (marker[1][0] === "~" || !line.includes("`", marker[0].length))) {
      flush(pos);
      pending = "code";
      fence = marker[1];
    } else if (markdown && /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) {
      flush(pos);
      pending = "heading";
      flush(end);
    } else if (markdown && pending === "paragraph" && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)) {
      pending = "heading";
      flush(end);
    } else {
      const kind = /^[ \t]*$/.test(line) ? "blank" : "paragraph";
      if (pending !== kind) flush(pos);
      pending = kind;
    }
    pos = end;
  }
  flush(source.length);
  return blocks;
}
function decodeText(bytes, media, requestedEncoding) {
  if (!(bytes instanceof Uint8Array) || media !== "text/plain" && media !== "text/markdown")
    throw new TextInputError("TEXT_INVALID_INPUT");
  if (bytes.byteLength > MAX_BYTES) throw new TextInputError("TEXT_TOO_LARGE");
  const encoding = selectEncoding(bomEncoding(bytes), requestedEncoding);
  let decoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: false });
  } catch {
    throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  }
  let text2;
  try {
    text2 = decoder.decode(bytes);
  } catch {
    throw new TextInputError("TEXT_INVALID_ENCODING");
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text2)) throw new TextInputError("TEXT_BINARY");
  return { encoding, blocks: indexBlocks(text2, media === "text/markdown") };
}

// src/host/reader-http.ts
import { createHash as createHash20 } from "node:crypto";

// src/host/word-locator.ts
var import_saxes = __toESM(require_saxes(), 1);
import { createHash as createHash19 } from "node:crypto";
var sha4 = (text2) => createHash19("sha256").update(text2, "utf8").digest("hex");
var wordNs = /* @__PURE__ */ new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
var bodyLimit = 1e6;
var wordPageLimit = 512;
async function wordParagraphs(bytes) {
  const xml = await wordBodyXml(bytes), p = new import_saxes.SaxesParser({ xmlns: true }), stack = [], paragraphs = [];
  let ns = "", body2 = 0, paragraph = 0, runText = 0, omitted = 0, text2 = "", count = 0;
  const invalid11 = () => {
    throw new Error("Unsupported Word structure");
  };
  const add = (s) => {
    count += s.length;
    if (count > bodyLimit) invalid11();
    text2 += s;
  };
  p.on("doctype", invalid11);
  p.on("opentag", (tag) => {
    stack.push(tag.uri === ns ? tag.local : "");
    const depth = stack.length;
    if (depth > 128) invalid11();
    if (depth === 1) {
      if (!wordNs.has(tag.uri) || tag.local !== "document") invalid11();
      ns = tag.uri;
      return;
    }
    if (depth === 2 && tag.uri === ns && tag.local === "body") {
      if (body2 || paragraphs.length) invalid11();
      body2 = depth;
      return;
    }
    if (!body2 || omitted) return;
    if (tag.local === "AlternateContent" || tag.uri === ns && ["altChunk", "txbxContent", "headerReference", "footerReference"].includes(tag.local)) invalid11();
    if (tag.uri !== ns) return;
    if (["del", "moveFrom"].includes(tag.local)) {
      omitted = depth;
      return;
    }
    if (tag.local === "p") {
      if (paragraph || paragraphs.length >= 32768) invalid11();
      paragraph = depth;
      text2 = "";
      return;
    }
    if (!paragraph || stack[depth - 2] !== "r") return;
    if (tag.local === "t") runText = depth;
    if (["tab", "br", "cr", "ptab"].includes(tag.local)) add(tag.local === "tab" || tag.local === "ptab" ? "	" : "\n");
    if (tag.local === "noBreakHyphen") add("\u2011");
    if (tag.local === "softHyphen") add("\xAD");
  });
  const characters = (s) => {
    if (runText && !omitted) add(s);
  };
  p.on("text", characters);
  p.on("cdata", characters);
  p.on("closetag", () => {
    const depth = stack.length;
    if (depth === runText) runText = 0;
    if (depth === omitted) omitted = 0;
    if (depth === paragraph) {
      paragraphs.push(text2);
      paragraph = 0;
    }
    if (depth === body2) body2 = 0;
    stack.pop();
  });
  p.write(xml).close();
  return paragraphs;
}
var compact = (s) => s.replace(/\s/gu, "");
function offsets(s) {
  const indices = [];
  for (const part of s.matchAll(/\S+/gu)) for (let i = 0; i < part[0].length; i++) indices.push(part.index + i);
  return indices;
}
async function alignWordSelection(paragraphs, version, sourceSha, ordinal, text2, start, end, pageCount, page) {
  if (pageCount > wordPageLimit || ordinal > pageCount) return;
  const parts = paragraphs.map(compact), body2 = parts.join("");
  if (!body2 || body2.length > bodyLimit) return;
  let pageStart = 0, cursor = 0;
  for (let n = 1; n <= pageCount; n++) {
    const pageText = await page(n), part = compact(pageText);
    if (!body2.startsWith(part, cursor) || n === ordinal && pageText !== text2) return;
    if (n === ordinal) pageStart = cursor;
    cursor += part.length;
  }
  if (cursor !== body2.length) return;
  const pageOffsets = offsets(text2), first = pageOffsets.findIndex((i) => i >= start);
  if (first < 0 || pageOffsets[first] >= end) return;
  let last = first;
  while (last + 1 < pageOffsets.length && pageOffsets[last + 1] < end) last++;
  const lo = pageStart + first, hi = pageStart + last + 1, blocks = [];
  cursor = 0;
  for (const [i, part] of parts.entries()) {
    const startAt = cursor;
    cursor += part.length;
    if (!part || cursor <= lo) continue;
    if (startAt >= hi) break;
    const source = offsets(paragraphs[i]), ordinal2 = i + 1;
    const previous = paragraphs[i - 1], next = paragraphs[i + 1];
    blocks.push({
      block_id: sha4(JSON.stringify(["word-paragraph-v1", version, sourceSha, ordinal2])),
      ordinal: ordinal2,
      start: source[Math.max(lo, startAt) - startAt],
      end: source[Math.min(hi, cursor) - startAt - 1] + 1,
      page_start: pageOffsets[Math.max(0, startAt - pageStart)],
      page_end: pageOffsets[Math.min(pageOffsets.length, cursor - pageStart) - 1] + 1,
      previous: previous === void 0 ? null : sha4(previous),
      next: next === void 0 ? null : sha4(next)
    });
    if (blocks.length > 1024) return;
  }
  if (blocks.length) return { source_sha256: sourceSha, blocks };
}

// src/host/reader-render-page.ts
import { crc32 as crc322, deflateSync } from "node:zlib";
function textStart(raw, preserveIndent) {
  return preserveIndent ? /^(?:[^\S\r\n]*(?:\r\n|\r|\n))*/.exec(raw)[0].length : raw.length - raw.trimStart().length;
}
function normalizeText(raw, preserveIndent = false) {
  return raw.slice(textStart(raw, preserveIndent)).toWellFormed().replace(/\r\n?/g, "\n").trimEnd();
}
function normalizeBoxes(raw, source, text2, preserveIndent = false) {
  const boxes = [];
  const trimStart = textStart(raw, preserveIndent);
  let out = 0;
  for (let i = trimStart; i < raw.length && out < text2.length; ) {
    const cp = raw.codePointAt(i);
    const units = cp > 65535 ? 2 : 1;
    const crlf = cp === 13 && raw.charCodeAt(i + 1) === 10;
    if (cp !== 13 && cp !== 10) {
      let rect = source[i];
      const tail = units === 2 ? source[i + 1] : void 0;
      if (tail && rect) {
        const x = Math.min(rect.x, tail.x), y = Math.min(rect.y, tail.y);
        rect = {
          x,
          y,
          width: Math.max(rect.x + rect.width, tail.x + tail.width) - x,
          height: Math.max(rect.y + rect.height, tail.y + tail.height) - y
        };
      } else rect ??= tail;
      if (rect) boxes.push({ start: out, end: out + units, ...rect });
    }
    i += crlf ? 2 : units;
    out += units;
  }
  return boxes;
}
function alignSavedPdfText(page, saved) {
  if (page.text === saved) return page;
  if (page.text.trimStart() !== saved) return;
  const leading = page.text.length - saved.length;
  return { ...page, text: saved, boxes: page.boxes.filter((b) => b.start >= leading).map((b) => ({ ...b, start: b.start - leading, end: b.end - leading })) };
}
function viewport(api, page) {
  const w = api.FPDF_GetPageWidthF(page), h = api.FPDF_GetPageHeightF(page);
  if (![w, h].every((n) => Number.isFinite(n) && n > 0)) throw Error("Invalid PDF page dimensions");
  const scale = Math.min(2, 1536 / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
function glyphRect(api, page, tp, index, width, height, ptr) {
  if (api.FPDFText_IsGenerated(tp, index) !== 0 || !api.FPDFText_GetCharBox(tp, index, ptr, ptr + 8, ptr + 16, ptr + 24)) return;
  const [left, right, bottom, top] = new Float64Array(api.memory.buffer, ptr, 4);
  if (![left, right, bottom, top].every(Number.isFinite)) return;
  const point4 = (x2, y2) => {
    if (!api.FPDF_PageToDevice(page, 0, 0, width, height, 0, x2, y2, ptr, ptr + 4)) return;
    return Array.from(new Int32Array(api.memory.buffer, ptr, 2));
  };
  const a = point4(left, bottom), b = point4(right, top);
  if (!a || !b) return;
  const x = Math.max(0, Math.min(a[0], b[0])), y = Math.max(0, Math.min(a[1], b[1]));
  const w = Math.min(width, Math.max(a[0], b[0])) - x, h = Math.min(height, Math.max(a[1], b[1])) - y;
  if (w > 0 && h > 0) return { x, y, width: w, height: h };
}
function chunk(name2, data) {
  const buf = Buffer.allocUnsafe(data.length + 12);
  buf.writeUInt32BE(data.length);
  buf.write(name2, 4, 4, "ascii");
  data.copy(buf, 8);
  buf.writeUInt32BE(crc322(buf.subarray(4, -4)), buf.length - 4);
  return buf;
}
function imagePng(api, page, width, height) {
  const bitmap = api.FPDFBitmap_Create(width, height, 0);
  if (!bitmap) throw Error("PDF bitmap unavailable");
  try {
    if (!api.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 4294967295)) throw Error("PDF bitmap unavailable");
    api.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 1);
    const ptr = api.FPDFBitmap_GetBuffer(bitmap), stride = api.FPDFBitmap_GetStride(bitmap);
    if (!ptr || stride < width * 4) throw Error("Invalid PDF bitmap");
    const bgr = new Uint8Array(api.memory.buffer, ptr, stride * height);
    const rows = Buffer.allocUnsafe((1 + 3 * width) * height);
    let dst = 0;
    for (let y = 0; y < height; y++) {
      rows[dst++] = 0;
      for (let x = 0, src = y * stride; x < width; x++, src += 4) {
        rows[dst++] = bgr[src + 2];
        rows[dst++] = bgr[src + 1];
        rows[dst++] = bgr[src];
      }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
    return "data:image/png;base64," + png.toString("base64");
  } finally {
    api.FPDFBitmap_Destroy(bitmap);
  }
}

// src/host/reader-http.ts
var uuid3 = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
var hash2 = (s) => createHash20("sha256").update(s, "utf8").digest("hex");
var ReaderService = class {
  constructor(store, originals, render2, wordPages, legacyWord) {
    this.store = store;
    this.originals = originals;
    this.render = render2;
    this.wordPages = wordPages;
    this.legacyWord = legacyWord;
  }
  access(current, asset, version) {
    return this.store.access(current(), asset, version);
  }
  navigation(current, t) {
    return this.store.navigation(current(), t);
  }
  savePosition(current, t, r, a) {
    return this.store.savePosition(current(), t, r, a);
  }
  addBookmark(current, t, title, a) {
    return this.store.addBookmark(current(), t, title, a);
  }
  deleteBookmark(current, t, id4, a) {
    return this.store.deleteBookmark(current(), t, id4, a);
  }
  listAnnotations(current, t) {
    return this.store.listAnnotations(current(), t);
  }
  addAnnotation(current, t, draft, a) {
    return this.store.addAnnotation(current(), t, draft, a);
  }
  updateAnnotation(current, t, id4, r, body2, a) {
    return this.store.updateAnnotation(current(), t, id4, r, body2, a);
  }
  deleteAnnotation(current, t, id4, r, a) {
    return this.store.deleteAnnotation(current(), t, id4, r, a);
  }
  async outline(current, t, signal) {
    const { actor_id, source, items } = this.store.outline(current(), t);
    if (source.kind !== "pdf") return { actor_id, items };
    if (!this.wordPages || !source.ref) throw new AssetError(503, "OUTLINE_UNAVAILABLE");
    const safe = () => {
      if (signal.aborted) throw new AssetError(409, "READ_CANCELLED");
      if (this.access(current, t.asset_id, t.version_id).actor_id !== actor_id) throw new AssetError(409, "READER_ACTOR_CHANGED");
    };
    try {
      const bytes = await this.originals.read(source.ref.key, source.ref.sha256, source.ref.byteLength);
      safe();
      const pdf = await this.wordPages(bytes, signal);
      let outline;
      try {
        if (!pdf.outline) throw Error("Outline unavailable");
        outline = await pdf.outline();
      } finally {
        await pdf.close();
      }
      safe();
      return { actor_id, items: outline };
    } catch (e) {
      safe();
      throw e instanceof AssetError ? e : new AssetError(503, "OUTLINE_UNAVAILABLE");
    }
  }
  async rendered(current, s, signal) {
    if (!this.render || !s.ref) throw new AssetError(503, "PAGE_RENDER_UNAVAILABLE");
    const bytes = await this.originals.read(s.ref.key, s.ref.sha256, s.ref.byteLength);
    const check = () => {
      if (signal.aborted) throw new AssetError(409, "READ_CANCELLED");
      const r = this.store.source(current(), s);
      if (r.state !== s.state || r.text !== s.text || r.ref?.sha256 !== s.ref?.sha256 || r.conversion_id !== s.conversion_id) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
    };
    check();
    let rendered;
    try {
      rendered = await this.render(bytes, s.ordinal, signal, s.kind === "pdf");
    } catch (e) {
      check();
      if (e?.code === "PDF_BUSY") throw new AssetError(429, "PAGE_RENDER_BUSY");
      throw e instanceof AssetError ? e : new AssetError(503, "PAGE_RENDER_UNAVAILABLE");
    }
    check();
    if (s.kind === "pdf") {
      const aligned = alignSavedPdfText(rendered, s.text);
      if (!aligned) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      return aligned;
    }
    return rendered;
  }
  async page(current, t, signal) {
    const s = this.store.source(current(), t), { ref: _private, wordOriginal: _word, ...publicFields } = s;
    const position = canRemember(s) ? { position_hash: positionHash(s) } : {};
    if (s.kind === "text" || !canRemember(s)) return { ...publicFields, ...position, anchor: hash2(s.text) };
    const { text: text2, image, width, height, boxes } = await this.rendered(current, s, signal);
    return { ...publicFields, ...position, text: text2, anchor: hash2(text2), image, width, height, boxes, original_sha256: s.ref.sha256 };
  }
  async witness(current, t, signal) {
    const s = this.store.source(current(), t);
    if (s.kind === "text") return;
    if (s.state !== "ready" && s.state !== "review") throw new AssetError(409, "SOURCE_NOT_READY");
    if (s.kind === "office" && !t.conversion_id) throw new AssetError(422, "INVALID_CITATION");
    const { text: text2, width, height, boxes } = await this.rendered(current, s, signal);
    return { ...s.conversion_id ? { conversion_id: s.conversion_id } : {}, sha256: s.ref.sha256, ordinal: t.ordinal, text: text2, width, height, boxes };
  }
  async wordSelection(current, s, spec2, w, signal) {
    const original = s.wordOriginal, ref = s.ref;
    if (!original || !ref || !this.wordPages || s.total > wordPageLimit) return;
    const deadline3 = AbortSignal.any([signal, AbortSignal.timeout(25e3)]);
    const check = () => {
      if (signal.aborted) throw new AssetError(409, "READ_CANCELLED");
      const r = this.store.source(current(), s);
      if (r.conversion_id !== s.conversion_id || r.ref?.sha256 !== ref.sha256 || r.wordOriginal?.sha256 !== original.sha256) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
    };
    try {
      check();
      const docx = original.media === WORD_MEDIA.docx ? await this.originals.read(original.key, original.sha256, original.byteLength) : await this.legacyWord?.(original, check, deadline3);
      check();
      if (!docx) return;
      const paragraphs = await wordParagraphs(docx), pdf = await this.originals.read(ref.key, ref.sha256, ref.byteLength);
      check();
      const doc = await this.wordPages(pdf, deadline3);
      try {
        if (doc.numPages !== s.total) return;
        return await alignWordSelection(paragraphs, s.version_id, original.sha256, s.ordinal, w.text, spec2.start, spec2.end, doc.numPages, async (n) => {
          check();
          deadline3.throwIfAborted();
          return (await doc.page(n)).text;
        });
      } finally {
        await doc.close();
      }
    } catch (e) {
      check();
      if (e?.code === "PDF_BUSY") throw new AssetError(429, "PAGE_RENDER_BUSY");
      if (deadline3.aborted) throw new AssetError(503, "WORD_STRUCTURE_UNAVAILABLE");
    }
  }
  async create(current, spec2, key, signal) {
    const w = await this.witness(current, spec2, signal);
    if (w?.conversion_id) {
      const old = this.store.replay(current(), spec2, key, w);
      if (old) return old;
      const word = await this.wordSelection(current, this.store.source(current(), spec2), spec2, w, signal);
      if (word) w.word = word;
    }
    return this.store.create(current(), spec2, key, w);
  }
  async resolve(current, id4, signal) {
    const t = this.store.target(current(), id4), w = t.conversion_id ? await this.witness(current, t, signal) : void 0;
    return this.store.resolve(current(), id4, w);
  }
};
async function readerRoute(req, url, service, current, signal, body2, reserve, send) {
  const annotations = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/reader-annotations(?:\/([a-f0-9-]+))?$/.exec(url.pathname);
  if (annotations && uuid3.test(annotations[1]) && uuid3.test(annotations[2]) && (!annotations[3] || uuid3.test(annotations[3]))) {
    const p = url.searchParams, keys4 = [...p.keys()], n = p.get("unit") ?? "1", cv = p.get("conversion"), id4 = annotations[3], m = req.method;
    if (keys4.some((k) => k !== "unit" && k !== "conversion") || new Set(keys4).size !== keys4.length || !/^\d{1,9}$/.test(n) || Number(n) < 1 || cv && !uuid3.test(cv) || cv === "") throw new AssetError(422, "INVALID_READER_UNIT");
    const t = { asset_id: annotations[1], version_id: annotations[2], ordinal: Number(n), ...cv ? { conversion_id: cv } : {} };
    if (m === "GET" && !id4) {
      send(200, service.listAnnotations(current, t));
      return true;
    }
    if (m === "POST" && !id4 || id4 && (m === "PATCH" || m === "DELETE")) {
      const a = req.headers["x-knowledgeos-reader-actor"];
      if (typeof a !== "string" || !uuid3.test(a)) throw new AssetError(422, "INVALID_READER_ACTOR");
      if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
      reserve();
      const b = await body2(req, "INVALID_ANNOTATION", 26e3);
      let v;
      try {
        v = JSON.parse(b.toString("utf8"));
      } catch {
        throw new AssetError(422, "INVALID_ANNOTATION");
      }
      const allowed = m === "POST" ? ["citation_id", "visibility", "body"] : m === "PATCH" ? ["body", "expected_revision"] : ["expected_revision"];
      if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some((k) => !allowed.includes(k)) || m !== "DELETE" && (typeof v.body !== "string" || !v.body.trim() || v.body.length > 4e3 || v.body.includes("\0"))) throw new AssetError(422, "INVALID_ANNOTATION");
      if (m === "POST") {
        if (typeof v.citation_id !== "string" || !uuid3.test(v.citation_id) || !["private", "project"].includes(v.visibility)) throw new AssetError(422, "INVALID_ANNOTATION");
        send(201, service.addAnnotation(current, t, v, a));
      } else if (id4) {
        const r = v.expected_revision;
        if (!Number.isSafeInteger(r) || r < 1 || r >= Number.MAX_SAFE_INTEGER) throw new AssetError(422, "INVALID_ANNOTATION_REVISION");
        send(200, m === "PATCH" ? service.updateAnnotation(current, t, id4, r, v.body, a) : service.deleteAnnotation(current, t, id4, r, a));
      }
      return true;
    }
  }
  const reading = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/reader-(state|outline|bookmarks)(?:\/([a-f0-9-]+))?$/.exec(url.pathname);
  if (reading && uuid3.test(reading[1]) && uuid3.test(reading[2]) && !url.search) {
    const t = { asset_id: reading[1], version_id: reading[2], ordinal: 1 }, kind = reading[3], id4 = reading[4], method = req.method;
    if (method === "GET" && !id4 && kind === "state") {
      send(200, service.navigation(current, t));
      return true;
    }
    if (method === "GET" && !id4 && kind === "outline") {
      reserve();
      send(200, await service.outline(current, t, signal));
      return true;
    }
    const save = kind === "state" && method === "PUT" && !id4, add = kind === "bookmarks" && method === "POST" && !id4, del = kind === "bookmarks" && method === "DELETE" && id4 && uuid3.test(id4);
    if (save || add || del) {
      const a = req.headers["x-knowledgeos-reader-actor"];
      if (typeof a !== "string" || !uuid3.test(a)) throw new AssetError(422, "INVALID_READER_ACTOR");
      if (del && id4) {
        send(200, service.deleteBookmark(current, t, id4, a));
        return true;
      }
      if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
      reserve();
      const b = await body2(req, "INVALID_READING_POINT", 2048);
      let v;
      try {
        v = JSON.parse(b.toString("utf8"));
      } catch {
        throw new AssetError(422, "INVALID_READING_POINT");
      }
      if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some((k) => !["ordinal", "source_hash", "conversion_id", save ? "expected_revision" : "title"].includes(k)) || !Number.isSafeInteger(v.ordinal) || v.ordinal < 1 || v.ordinal > 1e6 || typeof v.source_hash !== "string" || !/^[a-f0-9]{64}$/.test(v.source_hash) || "conversion_id" in v && (typeof v.conversion_id !== "string" || !uuid3.test(v.conversion_id))) throw new AssetError(422, "INVALID_READING_POINT");
      const p = { ...t, ordinal: v.ordinal, source_hash: v.source_hash, ...v.conversion_id ? { conversion_id: v.conversion_id } : {} };
      if (save) {
        if (!Number.isSafeInteger(v.expected_revision) || v.expected_revision < 0 || v.expected_revision >= Number.MAX_SAFE_INTEGER) throw new AssetError(422, "INVALID_READER_REVISION");
        send(200, service.savePosition(current, p, v.expected_revision, a));
      } else {
        if (typeof v.title !== "string" || !v.title.trim() || v.title.length > 120 || /[\p{Cc}\p{Cf}]/u.test(v.title)) throw new AssetError(422, "INVALID_BOOKMARK_TITLE");
        send(201, service.addBookmark(current, p, v.title.trim(), a));
      }
      return true;
    }
  }
  const access = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/reader-access$/.exec(url.pathname);
  if (access && uuid3.test(access[1]) && uuid3.test(access[2]) && !url.search && req.method === "GET") {
    send(200, service.access(current, access[1], access[2]));
    return true;
  }
  const reader = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/reader$/.exec(url.pathname);
  if (reader && uuid3.test(reader[1]) && uuid3.test(reader[2]) && req.method === "GET") {
    const p = url.searchParams, keys4 = [...p.keys()], unit = p.get("unit") ?? "1", cid = p.get("conversion");
    if (keys4.some((k) => !["unit", "conversion"].includes(k)) || keys4.length !== new Set(keys4).size || !/^\d{1,9}$/.test(unit) || Number(unit) < 1 || cid !== null && !uuid3.test(cid)) throw new AssetError(422, "INVALID_READER_UNIT");
    reserve();
    send(200, await service.page(current, { asset_id: reader[1], version_id: reader[2], ordinal: Number(unit), ...cid ? { conversion_id: cid } : {} }, signal));
    return true;
  }
  const resolve2 = /^\/knowledge\/v1\/citations\/([a-f0-9-]+)\/resolve$/.exec(url.pathname);
  if (resolve2 && uuid3.test(resolve2[1]) && !url.search && req.method === "GET") {
    reserve();
    send(200, await service.resolve(current, resolve2[1], signal));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/knowledge/v1/citations" && !url.search) {
    if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !uuid3.test(key)) throw new AssetError(422, "INVALID_CITATION_KEY");
    reserve();
    const b = await body2(req, "INVALID_CITATION", 2048);
    let v;
    try {
      v = JSON.parse(b.toString("utf8"));
    } catch {
      throw new AssetError(422, "INVALID_CITATION");
    }
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some((k) => !["asset_id", "version_id", "ordinal", "start", "end", "source_hash", "conversion_id"].includes(k)) || typeof v.asset_id !== "string" || !uuid3.test(v.asset_id) || typeof v.version_id !== "string" || !uuid3.test(v.version_id) || "conversion_id" in v && (typeof v.conversion_id !== "string" || !uuid3.test(v.conversion_id)) || !Number.isSafeInteger(v.ordinal) || v.ordinal < 1 || !Number.isSafeInteger(v.start) || !Number.isSafeInteger(v.end) || v.start < 0 || v.end <= v.start || typeof v.source_hash !== "string" || !/^[a-f0-9]{64}$/.test(v.source_hash)) throw new AssetError(422, "INVALID_CITATION");
    const r = await service.create(current, v, key, signal);
    send(r.replayed ? 200 : 201, r.data);
    return true;
  }
  return false;
}

// src/host/zip-reader.ts
import { crc32 as crc323, createInflateRaw as createInflateRaw2 } from "node:zlib";
var MiB = 1024 * 1024;
var ZIP_LIMITS = Object.freeze({
  archiveBytes: 64 * MiB,
  memberBytes: 64 * MiB,
  expandedBytes: 128 * MiB,
  entries: 512,
  pathBytes: 1024,
  pathDepth: 16,
  archiveDepth: 0
});
var ZipInputError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "ZipInputError";
  }
};
function reject(code) {
  throw new ZipInputError(code);
}
function valid(condition) {
  if (!condition) reject("ZIP_MALFORMED");
}
function limit(condition) {
  if (!condition) reject("ZIP_LIMIT_EXCEEDED");
}
function active2(signal) {
  if (signal?.aborted) reject("ZIP_CANCELLED");
}
var utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
var mediaTypes = /* @__PURE__ */ new Map([
  ["pdf", "application/pdf"],
  ["doc", WORD_MEDIA.doc],
  ["docx", WORD_MEDIA.docx],
  ["md", "text/markdown"],
  ["markdown", "text/markdown"],
  ["txt", "text/plain"]
]);
var nestedName = /\.(?:zipx?|7z|rar|tar|tgz|gz|bz2|xz|jar|war)$/i;
var forbidden = /[\\/:*?"<>|\p{Cc}\p{Cf}]/u;
var reserved = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9])(?: *\.|$)/iu;
function manifestPath(name2, directory, seen) {
  const parts = (directory ? name2.slice(0, -1) : name2).split("/");
  limit(parts.length <= ZIP_LIMITS.pathDepth);
  let key = "", original = "";
  for (const [i, part] of parts.entries()) {
    const normal = part.normalize("NFKC");
    if (!normal || forbidden.test(normal) || /[. ]$/.test(normal) || reserved.test(normal) || /~[0-9]+(?:\.|$)/i.test(normal)) reject("ZIP_UNSAFE_PATH");
    limit(Buffer.byteLength(part) <= 255);
    const last = i === parts.length - 1, dir = !last || directory;
    original += "/" + part;
    key += "/" + normal.toUpperCase();
    const old = seen.get(key);
    if (old && (old.original !== original || old.directory !== dir || last && old.explicit)) reject("ZIP_PATH_ALIAS");
    seen.set(key, { original, directory: dir, explicit: last || !!old?.explicit });
  }
  return parts.join("/").normalize("NFC");
}
function checkExtras(b, pos, end) {
  while (pos < end) {
    valid(pos + 4 <= end);
    const tag = b.readUInt16LE(pos), length = b.readUInt16LE(pos + 2);
    pos += 4;
    valid(pos + length <= end);
    if (![21589, 30837, 10].includes(tag)) reject("ZIP_UNSUPPORTED_FEATURE");
    if (tag === 10 && !(length === 32 && b.readUInt32LE(pos) === 0 && b.readUInt16LE(pos + 4) === 1 && b.readUInt16LE(pos + 6) === 24)) reject("ZIP_UNSUPPORTED_FEATURE");
    pos += length;
  }
}
function findEnd(b) {
  for (let pos = b.length - 22, floor = Math.max(0, pos - 65535); pos >= floor; --pos) {
    if (b.readUInt32LE(pos) === 101010256 && pos + 22 + b.readUInt16LE(pos + 20) === b.length) return pos;
  }
  return reject("ZIP_MALFORMED");
}
function parse(bytes) {
  valid(Buffer.isBuffer(bytes));
  limit(bytes.length <= ZIP_LIMITS.archiveBytes);
  if (bytes.buffer instanceof SharedArrayBuffer) reject("ZIP_UNSUPPORTED_FEATURE");
  const b = bytes, end = findEnd(b), count = b.readUInt16LE(end + 10), central = b.readUInt32LE(end + 16);
  if (b.readUInt32LE(end + 4) !== 0 || count === 65535 || central === 4294967295) reject("ZIP_UNSUPPORTED_FEATURE");
  valid(b.readUInt16LE(end + 8) === count && central + b.readUInt32LE(end + 12) === end);
  limit(count <= ZIP_LIMITS.entries);
  let pos = central, expanded = 0;
  const seen = /* @__PURE__ */ new Map(), records2 = [];
  for (let ordinal = 0; ordinal < count; ++ordinal) {
    valid(pos + 46 <= end && b.readUInt32LE(pos) === 33639248);
    const flags = b.readUInt16LE(pos + 8), method = b.readUInt16LE(pos + 10), crc = b.readUInt32LE(pos + 16), compressedSize = b.readUInt32LE(pos + 20), size = b.readUInt32LE(pos + 24), n = b.readUInt16LE(pos + 28), x = b.readUInt16LE(pos + 30), extraEnd = pos + 46 + n + x, next = extraEnd + b.readUInt16LE(pos + 32), local = b.readUInt32LE(pos + 42);
    if (flags & ~(2056 | (method === 8 ? 6 : 0)) || method !== 0 && method !== 8 || b.readUInt16LE(pos + 34) !== 0 || [compressedSize, size, local].includes(4294967295)) reject("ZIP_UNSUPPORTED_FEATURE");
    valid(n > 0 && next <= end && local + 30 <= central && b.readUInt32LE(local) === 67324752);
    expanded += size;
    limit(n <= ZIP_LIMITS.pathBytes && size <= ZIP_LIMITS.memberBytes && expanded <= ZIP_LIMITS.expandedBytes);
    const raw = b.subarray(pos + 46, pos + 46 + n);
    if (!(flags & 2048) && raw.some((byte) => byte >= 128)) reject("ZIP_UNSUPPORTED_FEATURE");
    let name2;
    try {
      name2 = utf8.decode(raw);
    } catch {
      return reject("ZIP_MALFORMED");
    }
    const directory = name2.endsWith("/"), attrs = b.readUInt32LE(pos + 38), kind = attrs >>> 16 & 61440;
    if (![0, 3, 10, 19].includes(b[pos + 5])) reject("ZIP_UNSUPPORTED_FEATURE");
    if (attrs & 1096 || kind !== 0 && kind !== (directory ? 16384 : 32768) || (attrs & 16) !== 0 && !directory) reject("ZIP_UNSAFE_TYPE");
    const path2 = manifestPath(name2, directory, seen);
    if (!directory && nestedName.test(path2)) reject("ZIP_NESTED_ARCHIVE");
    valid(!directory || size === 0 && crc === 0);
    valid(method !== 0 || size === compressedSize);
    checkExtras(b, pos + 46 + n, extraEnd);
    const start = local + 30 + n + b.readUInt16LE(local + 28), dataEnd = start + compressedSize;
    valid(dataEnd <= central && b.readUInt16LE(local + 26) === n && raw.equals(b.subarray(local + 30, local + 30 + n)));
    valid(b.readUInt16LE(local + 6) === flags && b.readUInt16LE(local + 8) === method && b.readUInt16LE(local + 4) === b.readUInt16LE(pos + 6));
    checkExtras(b, local + 30 + n, start);
    const descriptor = (flags & 8) !== 0;
    for (const [off, expected] of [[14, crc], [18, compressedSize], [22, size]]) {
      const value = b.readUInt32LE(local + off);
      valid(value === expected || descriptor && value === 0);
    }
    let recordEnd = dataEnd;
    if (descriptor) {
      valid(recordEnd + 12 <= central);
      if (b.readUInt32LE(recordEnd) === 134695760) recordEnd += 4;
      valid(recordEnd + 12 <= central && b.readUInt32LE(recordEnd) === crc && b.readUInt32LE(recordEnd + 4) === compressedSize && b.readUInt32LE(recordEnd + 8) === size);
      recordEnd += 12;
    }
    const ext = /\.([a-z]+)$/i.exec(path2)?.[1]?.toLowerCase(), media = !directory && ext && mediaTypes.get(ext) || null;
    records2.push({
      entry: { ordinal, name: name2, path: path2, size, compressedSize, media, reason: directory ? "ZIP_DIRECTORY" : media ? null : "ZIP_UNSUPPORTED_MEDIA" },
      local,
      start,
      end: recordEnd,
      method,
      crc
    });
    pos = next;
  }
  valid(pos === end);
  let tail = 0;
  for (const r of [...records2].sort((a, b2) => a.local - b2.local)) {
    valid(r.local === tail);
    tail = r.end;
  }
  valid(tail === central);
  return records2;
}
function inspectZip(bytes) {
  return parse(bytes).map((r) => r.entry);
}
function selectable(records2, ordinal) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= records2.length) reject("ZIP_INVALID_SELECTION");
  const r = records2[ordinal];
  if (r.entry.reason) reject(r.entry.reason);
  return r;
}
function checkContainer(bytes, media) {
  const sig = bytes.length >= 4 ? bytes.readUInt32LE(0) : 0;
  if ([67324752, 101010256, 134695760].includes(sig)) {
    if (media === WORD_MEDIA.docx) {
      try {
        checkWordEnvelope(bytes, WORD_MEDIA.docx);
        return;
      } catch {
      }
    }
    reject("ZIP_NESTED_ARCHIVE");
  }
  if (bytes.subarray(0, 2).equals(Buffer.from([31, 139])) || bytes.subarray(0, 6).toString("hex") === "377abcaf271c" || bytes.subarray(0, 6).toString("hex") === "fd377a585a00" || bytes.subarray(0, 4).toString("hex") === "52617221") reject("ZIP_NESTED_ARCHIVE");
}
async function decode(packed, r, signal) {
  active2(signal);
  const { size, media } = r.entry;
  let output;
  if (r.method === 0) {
    if (crc323(packed) !== r.crc) reject("ZIP_INTEGRITY");
    output = Buffer.from(packed);
  } else {
    output = Buffer.allocUnsafe(size);
    const stream = createInflateRaw2({ chunkSize: 32 * 1024 }), abort = () => {
      stream.destroy();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      stream.end(packed);
      let written = 0, crc = 0;
      for await (const chunk2 of stream) {
        active2(signal);
        if (chunk2.length > size - written) reject("ZIP_INTEGRITY");
        chunk2.copy(output, written);
        written += chunk2.length;
        crc = crc323(chunk2, crc);
      }
      active2(signal);
      if (written !== size || stream.bytesWritten !== packed.length || crc !== r.crc) reject("ZIP_INTEGRITY");
    } catch {
      active2(signal);
      return reject("ZIP_INTEGRITY");
    } finally {
      signal?.removeEventListener("abort", abort);
      stream.destroy();
    }
  }
  checkContainer(output, media);
  return output;
}
async function readZipMember(bytes, ordinal, signal) {
  active2(signal);
  const r = selectable(parse(bytes), ordinal), slice = bytes.subarray(r.start, r.start + r.entry.compressedSize);
  return decode(r.method === 0 ? slice : Buffer.from(slice), r, signal);
}
async function preflightZipSelection(bytes, ordinals, signal) {
  active2(signal);
  const records2 = parse(bytes);
  if (!Array.isArray(ordinals) || !ordinals.length || ordinals.length > records2.length || new Set(ordinals).size !== ordinals.length) reject("ZIP_INVALID_SELECTION");
  const selected = Array.from(ordinals, (i) => selectable(records2, i)), snapshot = Buffer.from(bytes);
  for (const r of selected) await decode(snapshot.subarray(r.start, r.start + r.entry.compressedSize), r, signal);
}

// src/host/library-http.ts
var uuid4 = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
var max = 64 * 1024 * 1024;
async function processInput(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
  let count = 0;
  const parts = [];
  for await (const chunk2 of req) {
    const b = Buffer.from(chunk2);
    count += b.length;
    if (count > 1024) throw new AssetError(413, "BODY_TOO_LARGE");
    parts.push(b);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AssetError(422, "INVALID_PROCESS");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !["version_id", "page"].includes(k)) || typeof value.version_id !== "string" || !uuid4.test(value.version_id) || "page" in value && (!Number.isSafeInteger(value.page) || value.page < 1 || value.page > 1e4)) throw new AssetError(422, "INVALID_PROCESS");
  return value;
}
async function receive(req, emptyCode, limit4) {
  const declared = req.headers["content-length"];
  if (declared !== void 0 && (!/^\d+$/.test(declared) || Number(declared) > limit4)) throw new AssetError(413, "FILE_TOO_LARGE");
  const chunks = [];
  let count = 0;
  for await (const chunk2 of req) {
    const b = Buffer.isBuffer(chunk2) ? chunk2 : Buffer.from(chunk2);
    count += b.length;
    if (count > limit4) throw new AssetError(413, "FILE_TOO_LARGE");
    chunks.push(b);
  }
  if (!count) throw new AssetError(422, emptyCode);
  return Buffer.concat(chunks, count);
}
function specFor(req) {
  const key = req.headers["idempotency-key"], name2 = req.headers["x-knowledgeos-filename"], assetId = req.headers["x-knowledgeos-asset-id"], version = req.headers["x-knowledgeos-expected-version"];
  if (typeof key !== "string" || !uuid4.test(key) || typeof name2 !== "string" || name2.length > 2200) throw new AssetError(422, "INVALID_IMPORT");
  let title;
  try {
    title = decodeURIComponent(name2).trim().normalize("NFC");
  } catch {
    throw new AssetError(422, "INVALID_FILENAME");
  }
  if (!title || title.length > 200 || /[\\/\x00-\x1f\x7f]/u.test(title)) throw new AssetError(422, "INVALID_FILENAME");
  if (assetId === void 0 && version === void 0) return { title, key };
  if (typeof assetId !== "string" || !uuid4.test(assetId) || typeof version !== "string" || !/^\d{1,9}$/.test(version) || Number(version) < 1) throw new AssetError(422, "INVALID_VERSION");
  return { title, key, assetId, expectedVersion: Number(version) };
}
function inputError(e) {
  if (e instanceof TextInputError) return new AssetError(e.code === "TEXT_TOO_LARGE" ? 413 : 422, e.code);
  if (e instanceof WordInputError) return new AssetError(422, "INVALID_WORD");
  if (e instanceof PdfInputError) return new AssetError(422, "INVALID_PDF");
  if (e instanceof ZipInputError) return new AssetError(e.code === "ZIP_LIMIT_EXCEEDED" ? 413 : 422, e.code);
}
async function publishInput(store, originals, current, spec2, bytes, media, encoding, hook) {
  const word = isWordMedia(media), isText = media === "text/plain" || media === "text/markdown";
  if (!isText && !word && media !== "application/pdf") throw new AssetError(415, "UNSUPPORTED_MEDIA_TYPE");
  const text2 = isText ? { media, ...decodeText(bytes, media, encoding) } : void 0;
  const blob = text2 ? await originals.putText(bytes) : word ? await originals.putWord(bytes, media) : await originals.put(bytes);
  let result;
  try {
    result = store.publish(current(), spec2, blob, word ? { media } : text2, hook);
  } catch (e) {
    if (e instanceof AssetError) await originals.discard(blob.key);
    else originals.retain(blob.key);
    throw e;
  }
  if (result.replayed) {
    await originals.discard(blob.key);
    const old = store.original(current(), result.receipt.id, result.receipt.version_id, false);
    await originals.read(old.key, old.sha256, old.byteLength);
  } else originals.retain(blob.key);
  store.original(current(), result.receipt.id, result.receipt.version_id, false);
  return result;
}
function libraryHandler(store, originals, origin, actorFor, parses, office, officeAvailable = () => true, archives, reader, search) {
  let transfers = 0;
  return async (req, res) => {
    const requestId = randomUUID22();
    let transfer = false, handlerDone = false, responseDone = false;
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    const json3 = (status, payload) => {
      if (!res.destroyed) {
        res.statusCode = status;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
      }
    };
    const release = () => {
      if (transfer && handlerDone && responseDone) {
        transfers--;
        transfer = false;
      }
    };
    const reserve = () => {
      if (transfers >= 2) throw new AssetError(429, "TRANSFER_BUSY");
      transfers++;
      transfer = true;
      const sent = () => {
        responseDone = true;
        res.off("finish", sent);
        res.off("close", sent);
        release();
      };
      res.once("finish", sent);
      res.once("close", sent);
      if (res.destroyed || res.writableFinished) sent();
    };
    try {
      const host = origin();
      if (!host || req.headers.host !== new URL(host).host || req.headers["sec-fetch-site"] === "cross-site" || req.headers.origin !== void 0 && req.headers.origin !== host || req.method !== "GET" && req.headers["x-knowledgeos-request"] !== "1") throw new AssetError(403, "CSRF_REJECTED");
      const actor2 = actorFor(req);
      if (!actor2) throw new AssetError(401, "AUTH_REQUIRED");
      const current = () => {
        const a = actorFor(req);
        if (!a || a.sessionId !== actor2.sessionId) throw new AssetError(401, "AUTH_REQUIRED");
        return a;
      };
      const url = new URL(req.url ?? "/", host);
      if (url.origin !== host) throw new AssetError(403, "CSRF_REJECTED");
      const replay = /^\/knowledge\/v1\/search\/([a-f0-9-]+)\/access$/.exec(url.pathname);
      if (search && replay && uuid4.test(replay[1]) && req.method === "GET" && !url.search) {
        json3(200, { data: search.revalidate(current(), replay[1]), request_id: requestId });
        return;
      }
      if (search && url.pathname === "/knowledge/v1/search" && req.method === "POST" && !url.search) {
        if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
        const bytes = await receive(req, "INVALID_SEARCH_QUERY", 2048);
        let value;
        try {
          value = JSON.parse(bytes.toString("utf8"));
        } catch {
          throw new AssetError(422, "INVALID_SEARCH_QUERY");
        }
        if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.query !== "string") throw new AssetError(422, "INVALID_SEARCH_QUERY");
        json3(200, { data: search.search(current(), value.query), request_id: requestId });
        return;
      }
      if (reader && (/\/reader(?:-access|-state|-outline|-(?:bookmarks|annotations)(?:\/[a-f0-9-]+)?)?$/.test(url.pathname) || url.pathname.startsWith("/knowledge/v1/citations"))) {
        const ac = new AbortController(), stop = () => ac.abort();
        res.once("close", stop);
        if (res.destroyed) stop();
        try {
          if (await readerRoute(req, url, reader, current, ac.signal, receive, reserve, (code, data) => json3(code, { data, request_id: requestId }))) return;
        } finally {
          res.off("close", stop);
        }
      }
      if (req.method === "GET" && url.pathname === "/knowledge/v1/assets" && !url.search) {
        json3(200, { data: { items: store.list(actor2) }, request_id: requestId });
        return;
      }
      const op = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/office(?:\/(start)|\/([a-f0-9-]+)\/(cancel|notes|pdf))?$/.exec(url.pathname);
      if (office && op && uuid4.test(op[1]) && uuid4.test(op[2]) && (!op[4] || uuid4.test(op[4]))) {
        const id4 = op[1], v = op[2], cid = op[4], command = op[3] ?? op[5], key = req.headers["idempotency-key"];
        const send = (status, data) => json3(status, { data, request_id: requestId });
        if (req.method === "GET" && !command) {
          const keys4 = [...url.searchParams.keys()];
          if (new Set(keys4).size !== keys4.length) throw new AssetError(422, "INVALID_HISTORY_CURSOR");
          send(200, office.list(current(), id4, v, Object.fromEntries(url.searchParams)));
          return;
        }
        if (req.method === "POST" && command === "start" && !url.search) {
          const r = office.start(current(), id4, v, typeof key === "string" ? key : "", officeAvailable());
          send(r.replayed ? 200 : 202, r);
          return;
        }
        if (req.method === "POST" && command === "cancel" && !url.search) {
          send(200, office.cancel(current(), id4, v, cid));
          return;
        }
        if (req.method === "POST" && command === "notes" && !url.search) {
          if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
          const bytes = await receive(req, "INVALID_QUALITY_NOTE", 16384);
          let input;
          try {
            input = JSON.parse(bytes.toString("utf8"));
          } catch {
            throw new AssetError(422, "INVALID_QUALITY_NOTE");
          }
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !["body", "page"].includes(k))) throw new AssetError(422, "INVALID_QUALITY_NOTE");
          const r = office.note(current(), id4, v, cid, typeof key === "string" ? key : "", input.page, input.body);
          send(r.replayed ? 200 : 201, r);
          return;
        }
        if (req.method === "GET" && command === "pdf" && (!url.search || url.search === "?download=1")) {
          reserve();
          const download = !!url.search, result = () => office.result(current(), id4, v, cid, download), ref = result();
          const bytes = await originals.read(ref.key, ref.sha256, ref.byteLength);
          result();
          res.setHeader("content-type", "application/pdf");
          res.setHeader("content-length", bytes.length);
          res.setHeader("content-security-policy", "sandbox; default-src 'none'");
          res.setHeader("content-disposition", `${download ? "attachment" : "inline"}; filename="preview.pdf"`);
          res.end(bytes);
          return;
        }
      }
      if (archives && !url.search) {
        const archive = /^\/knowledge\/v1\/imports\/([a-f0-9-]+)\/(entries|selection)$/.exec(url.pathname);
        if (req.method === "GET" && url.pathname === "/knowledge/v1/imports") {
          json3(200, { data: { items: archives.list(current()) }, request_id: requestId });
          return;
        }
        if (archive && uuid4.test(archive[1])) {
          const id4 = archive[1];
          if (req.method === "GET" && archive[2] === "entries") {
            json3(200, { data: archives.manifest(current(), id4), request_id: requestId });
            return;
          }
          if (req.method === "POST" && archive[2] === "selection") {
            const key = req.headers["idempotency-key"];
            if (typeof key !== "string" || !uuid4.test(key)) throw new AssetError(422, "INVALID_SELECTION");
            if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
            reserve();
            const body2 = await receive(req, "INVALID_SELECTION", 24 * 1024);
            let input;
            try {
              input = JSON.parse(body2.toString("utf8"));
            } catch {
              throw new AssetError(422, "INVALID_SELECTION");
            }
            if (!input || typeof input !== "object" || Object.keys(input).length !== 1 || !Array.isArray(input.entry_ids)) throw new AssetError(422, "INVALID_SELECTION");
            const ref = archives.source(current(), id4), items = archives.select(current(), id4, key, input.entry_ids), pending = items.filter((e) => !e.imported);
            if (pending.length) {
              const bytes = await originals.read(ref.key, ref.sha256, ref.byteLength);
              try {
                await preflightZipSelection(bytes, pending.map((e) => e.ordinal));
              } catch (e) {
                if (e instanceof ZipInputError) for (const m of pending) archives.failure(current(), id4, m.id, e.code);
                throw e;
              }
              for (const m of pending) {
                current();
                const content = await readZipMember(bytes, m.ordinal), title = m.path.split("/").at(-1);
                if (title.length > 200) {
                  archives.failure(current(), id4, m.id, "INVALID_FILENAME");
                  continue;
                }
                try {
                  await publishInput(store, originals, current, { title, key: m.key }, content, m.media, void 0, archives.publication(id4, m.id, m.key));
                } catch (e) {
                  const invalid11 = inputError(e);
                  if (!invalid11) throw e;
                  archives.failure(current(), id4, m.id, invalid11.code);
                }
              }
            }
            json3(200, { data: archives.manifest(current(), id4), request_id: requestId });
            return;
          }
        }
      }
      if (req.method === "POST" && url.pathname === "/knowledge/v1/imports" && !url.search) {
        const media = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
        if (media === "application/zip" && archives) {
          const spec3 = specFor(req);
          if (spec3.assetId || req.headers["x-knowledgeos-encoding"] !== void 0) throw new AssetError(422, "INVALID_IMPORT");
          reserve();
          const bytes2 = await receive(req, "ZIP_MALFORMED", max);
          current();
          const members = inspectZip(bytes2), blob = await originals.putArchive(bytes2);
          let staged;
          try {
            staged = archives.stage(current(), spec3, blob, members);
          } catch (e) {
            if (e instanceof AssetError) await originals.discard(blob.key);
            else originals.retain(blob.key);
            throw e;
          }
          if (staged.replayed) {
            await originals.discard(blob.key);
            const ref = archives.source(current(), staged.id);
            await originals.read(ref.key, ref.sha256, ref.byteLength);
          } else originals.retain(blob.key);
          json3(staged.replayed ? 200 : 201, { data: archives.manifest(current(), staged.id), request_id: requestId });
          return;
        }
        const word = isWordMedia(media), isText = media === "text/plain" || media === "text/markdown";
        if (media !== "application/pdf" && !isText && !word) throw new AssetError(415, "UNSUPPORTED_MEDIA_TYPE");
        const encoding = req.headers["x-knowledgeos-encoding"];
        if (encoding !== void 0 && (typeof encoding !== "string" || !isText)) throw new AssetError(422, "TEXT_UNSUPPORTED_ENCODING");
        const spec2 = specFor(req);
        reserve();
        const bytes = await receive(req, isText ? "TEXT_INVALID_INPUT" : word ? "INVALID_WORD" : "INVALID_PDF", isText ? MAX_BYTES : max);
        current();
        const result = await publishInput(store, originals, current, spec2, bytes, media, encoding);
        json3(result.replayed ? 200 : 201, { data: result.receipt, request_id: requestId });
        return;
      }
      const parse3 = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/parse(?:\/(start|cancel|chapters|retry\/([1-9]\d{0,4})))?$/.exec(url.pathname);
      const processPath = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/process$/.exec(url.pathname);
      const pagesPath = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/pages$/.exec(url.pathname);
      const operation = /^\/knowledge\/v1\/operations\/([a-f0-9-]+)$/.exec(url.pathname);
      const blockPath = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/blocks$/.exec(url.pathname);
      if (blockPath && req.method === "GET" && uuid4.test(blockPath[1]) && uuid4.test(blockPath[2])) {
        const keys4 = [...url.searchParams.keys()];
        if (keys4.some((k) => !["from", "limit"].includes(k)) || new Set(keys4).size !== keys4.length) throw new AssetError(422, "INVALID_BLOCK_RANGE");
        json3(200, { data: store.blocks(current(), blockPath[1], blockPath[2], Number(url.searchParams.get("from") ?? 1), Number(url.searchParams.get("limit") ?? 5)), request_id: requestId });
        return;
      }
      const respond = (v, data, asyncRequest) => {
        const active4 = ["queued", "running"].includes(String(data.state)), location = "/knowledge/v1/operations/" + v;
        if (asyncRequest && active4) res.setHeader("location", location);
        json3(asyncRequest && active4 ? 202 : 200, { data: { ...data, operation_id: v, status_url: location, cancellable: active4 }, request_id: requestId });
      };
      if (operation && parses && req.method === "GET" && !url.search && uuid4.test(operation[1])) {
        respond(operation[1], parses.operation(current(), operation[1]), false);
        return;
      }
      if (processPath && parses && req.method === "POST" && !url.search && uuid4.test(processPath[1])) {
        const { version_id: v, page } = await processInput(req);
        respond(v, parses.control(current(), processPath[1], v, page ? "retry" : "start", page), true);
        return;
      }
      if (pagesPath && parses && req.method === "GET" && uuid4.test(pagesPath[1]) && uuid4.test(pagesPath[2])) {
        const keys4 = [...url.searchParams.keys()];
        if (keys4.some((k) => !["from", "limit"].includes(k)) || new Set(keys4).size !== keys4.length) throw new AssetError(422, "INVALID_PAGE_RANGE");
        const from = Number(url.searchParams.get("from") ?? 1), limit4 = Number(url.searchParams.get("limit") ?? 5);
        json3(200, { data: parses.pages(current(), pagesPath[1], pagesPath[2], from, limit4), request_id: requestId });
        return;
      }
      if (parse3 && parses && !url.search && uuid4.test(parse3[1]) && uuid4.test(parse3[2]) && req.method === (parse3[3] ? "POST" : "GET")) {
        if (parse3[3] === "chapters") {
          if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
          const bytes = await receive(req, "INVALID_PDF_CHAPTERS", 4096);
          let ranges;
          try {
            ranges = JSON.parse(bytes.toString("utf8"));
          } catch {
            throw new AssetError(422, "INVALID_PDF_CHAPTERS");
          }
          respond(parse3[2], parses.control(current(), parse3[1], parse3[2], "chapters", void 0, ranges), true);
          return;
        }
        const op2 = parse3[4] ? "retry" : parse3[3] === "start" ? "start" : parse3[3] === "cancel" ? "cancel" : "status";
        respond(parse3[2], parses.control(current(), parse3[1], parse3[2], op2, parse3[4] ? Number(parse3[4]) : void 0), op2 === "start" || op2 === "retry");
        return;
      }
      const path2 = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/original$/.exec(url.pathname);
      if (req.method === "GET" && path2 && uuid4.test(path2[1]) && uuid4.test(path2[2]) && (!url.search || url.search === "?download=1")) {
        reserve();
        const download = Boolean(url.search), original = () => store.original(current(), path2[1], path2[2], download), r = original();
        const word = isWordMedia(r.media), ext = word ? r.media === WORD_MEDIA.doc ? "doc" : "docx" : r.media === "text/plain" ? "txt" : r.media === "text/markdown" ? "md" : "pdf";
        if (word && !download) throw new AssetError(422, "WORD_DOWNLOAD_REQUIRED");
        const bytes = await originals.read(r.key, r.sha256, r.byteLength);
        original();
        res.statusCode = 200;
        res.setHeader("content-type", word ? r.media : r.media ? `${download ? r.media : "text/plain"}; charset=${r.encoding}` : "application/pdf");
        res.setHeader("content-security-policy", "sandbox; default-src 'none'");
        res.setHeader("content-disposition", `${download ? "attachment" : "inline"}; filename="document.${ext}"`);
        res.setHeader("content-length", bytes.length);
        res.end(bytes);
        return;
      }
      throw new AssetError(404, "NOT_FOUND");
    } catch (e) {
      const error = e instanceof AssetError ? e : inputError(e) ?? new AssetError(503, "ORIGINAL_UNAVAILABLE");
      json3(error.status, { code: error.code, message: error.code, request_id: requestId });
    } finally {
      handlerDone = true;
      release();
    }
  };
}

// src/host/note-http.ts
var prefix = "/knowledge/v1/notes";
var limit2 = 2e5;
var invalid8 = () => new AssetError(422, "INVALID_NOTE");
var id = (value) => {
  if (typeof value !== "string" || !noteId.test(value)) throw invalid8();
  return value;
};
var keys2 = (body2, allowed) => {
  if (Object.keys(body2).some((k) => !allowed.includes(k))) throw invalid8();
};
async function jsonBody(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
  const parts = [];
  let size = 0;
  if (Number(req.headers["content-length"]) > limit2) throw new AssetError(413, "BODY_TOO_LARGE");
  for await (const chunk2 of req.iterator({ destroyOnReturn: false })) {
    const part = Buffer.from(chunk2);
    size += part.length;
    if (size > limit2) {
      req.resume();
      throw new AssetError(413, "BODY_TOO_LARGE");
    }
    parts.push(part);
  }
  let body2;
  try {
    body2 = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, size)));
  } catch {
    throw invalid8();
  }
  if (!body2 || typeof body2 !== "object" || Array.isArray(body2)) throw invalid8();
  return body2;
}
function fields2(input, all) {
  const patch = {};
  if (all || "title" in input) {
    if (!noteText(input.title, noteLimits.title)) throw invalid8();
    patch.title = input.title;
  }
  if (all || "body" in input) {
    if (!noteText(input.body, noteLimits.body)) throw invalid8();
    patch.body = input.body;
  }
  if (all || "kind" in input) {
    if (!noteKinds.includes(input.kind)) throw invalid8();
    patch.kind = input.kind;
  }
  return patch;
}
function outlineAction(input) {
  const common = ["actor_id", "expected_revision", "action"];
  switch (input.action) {
    case "add":
    case "edit": {
      const action2 = input.action, target3 = action2 === "add" ? "parent_id" : "node_id";
      keys2(input, [...common, target3, "body"]);
      if (!noteText(input.body, noteLimits.body)) throw invalid8();
      const body2 = input.body;
      return action2 === "add" ? { action: action2, parent_id: id(input[target3]), body: body2 } : { action: action2, node_id: id(input[target3]), body: body2 };
    }
    case "move":
      keys2(input, [...common, "node_id", "parent_id", "index"]);
      if (typeof input.index !== "number") throw invalid8();
      return { action: "move", node_id: id(input.node_id), parent_id: id(input.parent_id), index: input.index };
    case "delete":
      keys2(input, [...common, "node_id", "mode", "preview_token"]);
      if (input.mode !== "subtree" && input.mode !== "promote") throw invalid8();
      if (typeof input.preview_token !== "string" || !/^[a-f0-9]{64}$/.test(input.preview_token)) throw invalid8();
      return { action: "delete", node_id: id(input.node_id), mode: input.mode, preview_token: input.preview_token };
    case "undo":
      keys2(input, common);
      return { action: "undo" };
    default:
      throw invalid8();
  }
}
function createNoteHandler(store, origin, actorFor) {
  return async (req, res) => {
    const send = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(JSON.stringify(data));
    };
    try {
      const base = origin(), method = req.method;
      if (!base || req.headers.host !== new URL(base).host || req.headers["sec-fetch-site"] === "cross-site" || req.headers.origin !== void 0 && req.headers.origin !== base || method !== "GET" && req.headers["x-knowledgeos-request"] !== "1") throw new AssetError(403, "CSRF_REJECTED");
      const url = new URL(req.url ?? "/", base), path2 = url.pathname;
      if (url.origin !== base) throw new AssetError(403, "CSRF_REJECTED");
      const actor2 = actorFor(req);
      if (!actor2) throw new AssetError(401, "AUTH_REQUIRED");
      const info = { actor_id: actor2.userId }, row = /^\/knowledge\/v1\/notes\/([^/]+)$/.exec(path2), project = /^\/knowledge\/v1\/notes\/projects\/([^/]+)$/.exec(path2);
      const cursor = () => {
        if ([...url.searchParams].length === 0) return "";
        if ([...url.searchParams].length !== 1 || !url.searchParams.has("after")) throw invalid8();
        return id(url.searchParams.get("after"));
      };
      if (method === "GET" && path2 === prefix) return send(200, { data: { ...info, ...store.list(actor2, cursor()) } });
      if (method === "GET" && path2 === prefix + "/projects") return send(200, { data: { ...info, ...store.managedProjects(actor2, cursor()) } });
      if (method === "GET" && project) return send(200, { data: { ...info, ...store.projectRefs(actor2, id(project[1]), cursor()) } });
      if (url.search) throw invalid8();
      const outline = /^\/knowledge\/v1\/notes\/([^/]+)\/(nodes|delete-preview)$/.exec(path2);
      if (outline && (method === "PATCH" && outline[2] === "nodes" || method === "POST" && outline[2] === "delete-preview")) {
        const input = await jsonBody(req), expected = id(input.actor_id), note = id(outline[1]), revision = input.expected_revision;
        if (typeof revision !== "number") throw invalid8();
        if (method === "PATCH") return send(200, { data: { ...info, ...store.changeOutline(actor2, expected, note, revision, outlineAction(input)) } });
        keys2(input, ["actor_id", "expected_revision", "node_id"]);
        return send(200, { data: { ...info, ...store.previewDelete(actor2, expected, note, revision, id(input.node_id)) } });
      }
      if (method === "GET" && row) return send(200, { data: { ...info, ...store.get(actor2, id(row[1])) } });
      if (method === "POST" && path2 === prefix) {
        const input = await jsonBody(req);
        keys2(input, ["actor_id", "title", "body", "kind", "add_citation"]);
        const saved = store.create(actor2, id(input.actor_id), id(req.headers["idempotency-key"]), fields2(input, true), "add_citation" in input ? id(input.add_citation) : void 0);
        return send(saved.replayed ? 200 : 201, { data: { ...info, ...saved.data } });
      }
      if (method === "PATCH" && row) {
        const input = await jsonBody(req);
        keys2(input, ["actor_id", "expected_revision", "title", "body", "kind", "add_citation", "remove_reference"]);
        const patch = fields2(input, false);
        if ("add_citation" in input) patch.add_citation = id(input.add_citation);
        if ("remove_reference" in input) patch.remove_reference = id(input.remove_reference);
        if (typeof input.expected_revision !== "number") throw invalid8();
        return send(200, { data: { ...info, ...store.save(actor2, id(input.actor_id), id(row[1]), input.expected_revision, patch) } });
      }
      if (method === "POST" && project) {
        const input = await jsonBody(req);
        keys2(input, ["actor_id", "note_id"]);
        const result = store.linkProject(actor2, id(input.actor_id), id(project[1]), id(input.note_id));
        return send(result.replayed ? 200 : 201, { data: { ...info, ...result } });
      }
      throw new AssetError(404, "NOT_FOUND");
    } catch (e) {
      send(e instanceof AssetError ? e.status : 503, { code: e instanceof AssetError ? e.code : "STORAGE_UNAVAILABLE" });
    }
  };
}

// src/host/recall-http.ts
var basePath = "/knowledge/v1/recall";
var uuid5 = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
var limit3 = 2 * 1024 * 1024;
var invalid9 = () => new AssetError(422, "INVALID_RECALL");
function id2(x) {
  if (typeof x !== "string" || !uuid5.test(x)) throw invalid9();
  return x;
}
function integer(x, min = 1) {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < min || x >= Number.MAX_SAFE_INTEGER) throw invalid9();
  return x;
}
function object(x, keys4) {
  if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).some((k) => !keys4.includes(k))) throw invalid9();
  return x;
}
function hash3(h) {
  if (typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h)) throw invalid9();
  return h;
}
function point3(value) {
  const v = object(value, ["ordinal", "offset", "source_hash"]);
  return { ordinal: integer(v.ordinal), offset: integer(v.offset, 0), source_hash: hash3(v.source_hash) };
}
function target2(v) {
  return { asset_id: id2(v.asset_id), version_id: id2(v.version_id), ..."conversion_id" in v ? { conversion_id: id2(v.conversion_id) } : {} };
}
async function json2(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
  if (Number(req.headers["content-length"]) > limit3) throw new AssetError(413, "BODY_TOO_LARGE");
  const chunks = [];
  let size = 0;
  for await (const chunk2 of req.iterator({ destroyOnReturn: false })) {
    const b = Buffer.from(chunk2);
    size += b.length;
    if (size > limit3) {
      req.resume();
      throw new AssetError(413, "BODY_TOO_LARGE");
    }
    chunks.push(b);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
  } catch {
    throw invalid9();
  }
}
function createRecallHandler(store, origin, actorFor) {
  return async (req, res) => {
    const send = (http, data) => {
      if (!res.destroyed) {
        res.writeHead(http, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end(JSON.stringify(data));
      }
    };
    try {
      const base = origin(), method = req.method;
      if (!base || req.headers.host !== new URL(base).host || req.headers["sec-fetch-site"] === "cross-site" || req.headers.origin !== void 0 && req.headers.origin !== base || method !== "GET" && req.headers["x-knowledgeos-request"] !== "1") throw new AssetError(403, "CSRF_REJECTED");
      const url = new URL(req.url ?? "/", base);
      if (url.origin !== base) throw new AssetError(403, "CSRF_REJECTED");
      const actor2 = actorFor(req);
      if (!actor2) throw new AssetError(401, "AUTH_REQUIRED");
      const path2 = url.pathname, q = url.searchParams, info = { actor_id: actor2.userId };
      if (new Set(q.keys()).size !== q.size) throw invalid9();
      if (method === "GET" && path2 === basePath + "/source") {
        const fields3 = object(Object.fromEntries(q), ["asset_id", "version_id", "conversion_id", "ordinal"]), n = q.get("ordinal");
        if (n === null || !/^\d+$/.test(n)) throw invalid9();
        return send(200, { data: store.authorPage(actor2, { ...target2(fields3), ordinal: integer(Number(n)) }) });
      }
      if (method === "GET" && path2 === basePath) {
        if ([...q.keys()].some((k) => k !== "after")) throw invalid9();
        return send(200, { data: { ...info, ...store.list(actor2, q.has("after") ? id2(q.get("after")) : "") } });
      }
      if (q.size) throw invalid9();
      if (method === "POST" && path2 === basePath) {
        const v = object(await json2(req), ["actor_id", "asset_id", "version_id", "conversion_id", "title", "first", "last", "interior_hashes", "masks"]);
        if (typeof v.title !== "string" || v.title.includes("\0") || !Array.isArray(v.masks) || !Array.isArray(v.interior_hashes)) throw invalid9();
        const masks = v.masks.map((raw) => {
          const m = object(raw, ["ordinal", "start", "end", "group"]);
          return { ordinal: integer(m.ordinal), start: integer(m.start, 0), end: integer(m.end), group: integer(m.group) };
        });
        const saved = store.create(actor2, id2(v.actor_id), id2(req.headers["idempotency-key"]), { ...target2(v), title: v.title.trim(), first: point3(v.first), last: point3(v.last), interior_hashes: v.interior_hashes.map(hash3), masks });
        return send(saved.replayed ? 200 : 201, { data: { ...info, ...saved.data } });
      }
      const row = /^\/knowledge\/v1\/recall\/([^/]+)$/.exec(path2);
      if (row && method === "GET") return send(200, { data: { ...info, ...store.get(actor2, id2(row[1])) } });
      if (row && method === "PATCH") {
        const v = object(await json2(req), ["actor_id", "event", "value", "expected_revision"]), event = v.event;
        if (event !== "move" && event !== "hint" && event !== "reveal" && event !== "recall" && event !== "rating") throw invalid9();
        const action2 = { event, value: integer(v.value), expected_revision: integer(v.expected_revision) };
        return send(200, { data: { ...info, ...store.act(actor2, id2(v.actor_id), id2(row[1]), id2(req.headers["idempotency-key"]), action2) } });
      }
      throw new AssetError(404, "NOT_FOUND");
    } catch (e) {
      send(e instanceof AssetError ? e.status : 503, { code: e instanceof AssetError ? e.code : "STORAGE_UNAVAILABLE" });
    }
  };
}

// src/host/invitation-http.ts
import { randomUUID as randomUUID23 } from "node:crypto";
var path = "/knowledge/v1/invitations";
var uuid6 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var invalid10 = () => new AssetError(422, "INVALID_INVITATION");
function id3(v) {
  if (typeof v !== "string" || !uuid6.test(v)) throw invalid10();
  return v;
}
function positive(v) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) throw invalid10();
  return v;
}
function optional(v) {
  return v === void 0 ? void 0 : positive(v);
}
function keys3(o, allowed) {
  if (Object.keys(o).some((k) => !allowed.includes(k))) throw invalid10();
}
function spec(o) {
  keys3(o, ["actor_id", "scope", "target_id", "permission", "days", "max_redemptions"]);
  const common = { id: id3(o.target_id), days: optional(o.days), max_redemptions: optional(o.max_redemptions) };
  if (o.scope === "object" && (o.permission === "read" || o.permission === "edit")) return { ...common, scope: o.scope, permission: o.permission };
  if (o.scope === "project" && o.permission === "member") return { ...common, scope: o.scope, permission: o.permission };
  throw invalid10();
}
async function body(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
  if (Number(req.headers["content-length"]) > 8192) throw new AssetError(413, "BODY_TOO_LARGE");
  const chunks = [];
  let size = 0;
  for await (const chunk2 of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk2);
    size += bytes.length;
    if (size > 8192) {
      req.resume();
      throw new AssetError(413, "BODY_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  try {
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw invalid10();
    return data;
  } catch {
    throw invalid10();
  }
}
function createInvitationHandler(store, origin, actorFor) {
  return async (req, res) => {
    const correlation = randomUUID23();
    const send = (status, data) => {
      if (!res.destroyed) {
        res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-knowledgeos-request-id": correlation });
        res.end(JSON.stringify(data));
      }
    };
    try {
      const base = origin(), method = req.method;
      if (!base || req.headers.host !== new URL(base).host || req.headers["sec-fetch-site"] === "cross-site" || req.headers.origin !== void 0 && req.headers.origin !== base || method !== "GET" && req.headers["x-knowledgeos-request"] !== "1") throw new AssetError(403, "CSRF_REJECTED");
      const url = new URL(req.url ?? "/", base);
      if (url.origin !== base) throw new AssetError(403, "CSRF_REJECTED");
      if (url.search) throw invalid10();
      const a = actorFor(req);
      if (!a) throw new AssetError(401, "AUTH_REQUIRED");
      const p = url.pathname, row = /^\/knowledge\/v1\/invitations\/([a-f0-9-]+)(?:\/(renew|revoke))?$/.exec(p);
      const reply = (status, fields3) => send(status, { data: { actor_id: a.userId, ...fields3 } });
      if (method === "GET" && p === path) return reply(200, store.list(a));
      if (method === "GET" && row && !row[2]) return reply(200, store.get(a, a.userId, id3(row[1])));
      if (method === "POST") {
        const b = await body(req), expected = id3(b.actor_id);
        if (p === path + "/preview") return reply(200, store.preview(a, expected, spec(b)));
        if (p === path) {
          const created = store.create(a, expected, spec(b), id3(req.headers["idempotency-key"]), correlation);
          return reply(created.replayed ? 200 : 201, created);
        }
        if (p === path + "/redeem") {
          keys3(b, ["actor_id", "token"]);
          if (typeof b.token !== "string") throw invalid10();
          const redeemed = store.redeem(a, expected, b.token, correlation);
          return reply(redeemed.replayed ? 200 : 201, redeemed);
        }
        if (row?.[2] === "renew" || row?.[2] === "revoke") {
          keys3(b, row[2] === "renew" ? ["actor_id", "expected_revision", "days"] : ["actor_id", "expected_revision"]);
          return reply(200, store.change(a, expected, id3(row[1]), positive(b.expected_revision), row[2], optional(b.days), id3(req.headers["idempotency-key"]), correlation));
        }
      }
      throw new AssetError(404, "NOT_FOUND");
    } catch (e) {
      send(e instanceof AssetError ? e.status : 503, { code: e instanceof AssetError ? e.code : "STORAGE_UNAVAILABLE" });
    }
  };
}

// src/host/pdf-extractor.ts
import { readFile } from "node:fs/promises";
import { Worker, parentPort, workerData } from "node:worker_threads";
var MiB2 = 1024 * 1024;
var MAX_BYTES2 = 64 * MiB2;
var MAX_MEMORY = 256 * MiB2;
var MAX_PAGES = 1e4;
var MAX_CHARS = 32e3;
var MAX_BOOKMARKS = 2048;
var MAX_TITLE_BYTES = 512;
var DEADLINE_MS = 15e3;
var MAX_WORKERS = 2;
var role = "knowledgeos:pdf-extractor:v1";
var readerRole = "knowledgeos:pdf-reader:v1";
var indexRole = "knowledgeos:pdf-index:v1";
var active3 = { extract: 0, reader: 0, index: 0 };
function pdfError(code, message) {
  return Object.assign(new Error(message), { code });
}
function openPdf(bytes) {
  return open(bytes, "extract");
}
function openIndexPdf(bytes, signal) {
  return open(bytes, "index", signal);
}
function openReaderPdf(bytes, signal) {
  return open(bytes, "reader", signal);
}
async function open(bytes, pool, signal) {
  if (signal?.aborted) throw pdfError("PDF_HANDLE_CLOSED", "PDF closed");
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_BYTES2)
    throw pdfError("PDF_OPEN_FAILED", "Invalid PDF input size or type");
  if (active3[pool] >= (pool === "index" ? 1 : MAX_WORKERS)) throw pdfError("PDF_BUSY", "PDF extractor busy");
  const copy = new Uint8Array(bytes);
  const worker = new Worker(new URL("./pdf-extractor.js", import.meta.url), {
    workerData: pool === "reader" ? readerRole : pool === "index" ? indexRole : role,
    env: {},
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8 }
  });
  active3[pool]++;
  let pending;
  let closing;
  const close = () => {
    if (!closing) {
      signal?.removeEventListener("abort", abort);
      closing = worker.terminate().then(() => {
      }).finally(() => {
        active3[pool]--;
      });
      pending?.({ error: "PDF closed", fatal: true });
    }
    return closing;
  };
  function fail(error) {
    pending?.({ error, fatal: true });
    void close();
  }
  function abort() {
    void close();
  }
  signal?.addEventListener("abort", abort, { once: true });
  worker.on("message", (msg) => {
    pending?.(msg);
    if ("error" in msg && msg.fatal) void close();
  });
  worker.on("error", () => fail("PDF worker failed"));
  worker.on("exit", () => fail("PDF worker exited"));
  function request(input) {
    if (closing) return Promise.reject(pdfError("PDF_HANDLE_CLOSED", "PDF closed"));
    if (pending) return Promise.reject(pdfError("PDF_BUSY", "PDF extractor busy"));
    return new Promise((resolve2, reject2) => {
      const timer = setTimeout(() => fail("PDF parser deadline exceeded"), DEADLINE_MS);
      pending = (msg) => {
        clearTimeout(timer);
        pending = void 0;
        if ("error" in msg) {
          const code = input instanceof Uint8Array ? "PDF_OPEN_FAILED" : msg.fatal ? "PDF_HANDLE_CLOSED" : "PDF_PAGE_FAILED";
          reject2(pdfError(code, msg.error));
        } else resolve2(msg.value);
      };
      try {
        worker.postMessage(input, input instanceof Uint8Array ? [input.buffer] : []);
      } catch {
        fail("PDF worker unavailable");
      }
    });
  }
  try {
    const numPages = await request(copy);
    return { numPages, close, async outline() {
      return await request("outline");
    }, async page(n) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError("Invalid PDF page number");
      return await request(n);
    }, async renderPage(n, preserveIndent = false) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError("Invalid PDF page number");
      return await request({ render: n, preserveIndent });
    } };
  } catch (error) {
    await close();
    throw error;
  }
}
async function loadEngine() {
  const binary = await readFile(new URL("./pdfium.wasm", import.meta.url));
  const module = await WebAssembly.compile(binary);
  let api;
  const unsupported = (op) => () => {
    throw new Error(`PDF parser stopped: ${op}`);
  };
  const utcTime = (low, high, out) => {
    const date = new Date((high * 2 ** 32 + (low >>> 0)) * 1e3);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid PDF timestamp");
    const year = date.getUTCFullYear(), jan = /* @__PURE__ */ new Date(0);
    jan.setUTCFullYear(year, 0, 1);
    const parts = [
      date.getUTCSeconds(),
      date.getUTCMinutes(),
      date.getUTCHours(),
      date.getUTCDate(),
      date.getUTCMonth(),
      year - 1900,
      date.getUTCDay(),
      Math.floor((date.getTime() - jan.getTime()) / 864e5),
      0,
      0
    ];
    const tm = new DataView(api.memory.buffer, out >>> 0, parts.length * 4);
    for (const [i, value] of parts.entries()) tm.setInt32(i * 4, value, true);
  };
  const env = {
    _abort_js: unsupported("abort"),
    __assert_fail: unsupported("assertion"),
    _emscripten_throw_longjmp: unsupported("unwind"),
    emscripten_date_now: () => 0,
    _localtime_js: utcTime,
    _gmtime_js: utcTime,
    _tzset_js: (timezone, daylight, standard, summer) => {
      const data = new DataView(api.memory.buffer);
      data.setInt32(timezone >>> 0, 0, true);
      data.setInt32(daylight >>> 0, 0, true);
      for (const ptr of [standard, summer]) new Uint8Array(api.memory.buffer, ptr >>> 0, 4).set([85, 84, 67, 0]);
    },
    _emscripten_memcpy_js: (to, from, len) => {
      new Uint8Array(api.memory.buffer).copyWithin(to, from, from + len);
    },
    emscripten_resize_heap: (size) => {
      const old = api.memory.buffer.byteLength;
      if (size >>> 0 > MAX_MEMORY) throw new Error("PDF parser memory limit");
      const target3 = Math.min(MAX_MEMORY, Math.max(size >>> 0, old + 8 * MiB2));
      api.memory.grow(Math.ceil((target3 - old) / 65536));
      return 1;
    }
  };
  for (const { name: name2, module: ns } of WebAssembly.Module.imports(module)) {
    if (ns === "env" && /^invoke_[vi]+$/.test(name2))
      env[name2] = (i, ...args2) => api.__indirect_function_table.get(i)(...args2);
  }
  for (const op of ["openat", "fcntl64", "ioctl", "fstat64", "stat64", "newfstatat", "lstat64", "getdents64", "unlinkat", "rmdir", "ftruncate64"])
    env["__syscall_" + op] = () => -44;
  const wasi = {};
  for (const op of ["fd_close", "fd_write", "fd_read", "fd_sync", "fd_seek", "environ_get", "environ_sizes_get"])
    wasi[op] = () => 76;
  const instance = await WebAssembly.instantiate(module, { env, wasi_snapshot_preview1: wasi });
  api = instance.exports;
  api.emscripten_stack_init();
  api.__wasm_call_ctors();
  api.FPDF_InitLibrary();
  return api;
}
function allocate(api, n) {
  const ptr = api.malloc(n);
  if (!ptr) throw new Error("PDF parser allocation failed");
  return ptr;
}
function readOutline(api, doc, pages, nested) {
  const titles = [], seen = /* @__PURE__ */ new Set();
  const buf = allocate(api, MAX_TITLE_BYTES);
  try {
    const stack = [{ bm: api.FPDFBookmark_GetFirstChild(doc, 0), depth: 0 }];
    while (stack.length) {
      const { bm, depth } = stack.pop();
      if (!bm) continue;
      if (seen.has(bm) || seen.size >= MAX_BOOKMARKS) return [];
      seen.add(bm);
      stack.push({ bm: api.FPDFBookmark_GetNextSibling(doc, bm), depth });
      if (nested) stack.push({ bm: api.FPDFBookmark_GetFirstChild(doc, bm), depth: depth + 1 });
      let dest = api.FPDFBookmark_GetDest(doc, bm);
      if (!dest) {
        const action2 = api.FPDFBookmark_GetAction(bm);
        if (action2 && api.FPDFAction_GetType(action2) === 1) dest = api.FPDFAction_GetDest(doc, action2);
      }
      if (!dest) continue;
      const n = api.FPDFDest_GetDestPageIndex(doc, dest) + 1;
      if (n < 1 || n > pages) continue;
      const len = api.FPDFBookmark_GetTitle(bm, buf, MAX_TITLE_BYTES);
      if (len < 4 || len > MAX_TITLE_BYTES || len % 2) continue;
      const title = new TextDecoder("utf-16le").decode(new Uint8Array(api.memory.buffer, buf, len - 2)).replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
      if (title) titles.push({ ordinal: n, title, depth });
    }
    return titles;
  } finally {
    api.free(buf);
  }
}
var PageFailure = class extends Error {
};
async function parse2(bytes) {
  const api = await loadEngine(), ptr = allocate(api, bytes.length);
  new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes);
  const doc = api.FPDF_LoadMemDocument(ptr, bytes.length, 0);
  if (!doc) throw new Error("Invalid or password-protected PDF");
  if (api.FPDF_GetSecurityHandlerRevision(doc) >= 0) throw new Error("Encrypted PDF is not supported");
  const numPages = api.FPDF_GetPageCount(doc);
  if (numPages < 1 || numPages > MAX_PAGES) throw new Error("Invalid or excessive PDF page count");
  const labels = [""];
  if (workerData !== readerRole) {
    const titles = /* @__PURE__ */ new Map();
    for (const entry of readOutline(api, doc, numPages, false)) if (!titles.has(entry.ordinal)) titles.set(entry.ordinal, entry.title);
    for (let i = 1; i <= numPages; i++) labels.push(titles.get(i) ?? labels[i - 1]);
  }
  function page(n, render2 = false, preserveIndent = workerData === role) {
    const p = api.FPDF_LoadPage(doc, n - 1);
    if (!p) throw new PageFailure("Failed to load PDF page");
    try {
      const tp = api.FPDFText_LoadPage(p);
      if (!tp) throw new PageFailure("Failed to load PDF page text");
      try {
        const count = api.FPDFText_CountChars(tp);
        if (count < 0 || count > MAX_CHARS) throw new PageFailure("Invalid or excessive PDF page text length");
        const objects = render2 ? 0 : api.FPDFPage_CountObjects(p);
        let text2 = "", needsReview = objects < 0 || objects > 4096;
        for (let i = 0; i < objects && !needsReview; i++) {
          const type = api.FPDFPageObj_GetType(api.FPDFPage_GetObject(p, i));
          needsReview = type === 0 || type === 3 || type === 5;
        }
        const view = render2 ? viewport(api, p) : void 0;
        const source = [];
        const scratch = view ? allocate(api, 32) : 0;
        try {
          for (let i = 0; i < count; i++) {
            const ch = api.FPDFText_GetUnicode(tp, i);
            if (!view && (api.FPDFText_HasUnicodeMapError(tp, i) !== 0 || !ch || ch > 1114111)) needsReview = true;
            if (view) source[text2.length] = glyphRect(api, p, tp, i, view.width, view.height, scratch);
            text2 += ch && ch <= 1114111 ? String.fromCodePoint(ch) : "\uFFFD";
          }
        } finally {
          if (scratch) api.free(scratch);
        }
        const raw = text2;
        text2 = normalizeText(raw, preserveIndent);
        if (view) return { text: text2, ...view, boxes: normalizeBoxes(raw, source, text2, preserveIndent), image: imagePng(api, p, view.width, view.height) };
        needsReview ||= !text2 || /[\ufffd\p{Co}\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text2);
        return { text: text2, needsReview, chapter: labels[n], confirmedBlank: objects === 0 && count === 0 };
      } finally {
        api.FPDFText_ClosePage(tp);
      }
    } finally {
      api.FPDF_ClosePage(p);
    }
  }
  return { numPages, page, outline: () => readOutline(api, doc, numPages, true) };
}
if (parentPort && (workerData === role || workerData === readerRole || workerData === indexRole)) {
  const port = parentPort;
  let document;
  port.on("message", async (input) => {
    try {
      if (input instanceof Uint8Array) {
        document = await parse2(input);
        port.postMessage({ value: document.numPages });
      } else if (input === "outline") port.postMessage({ value: document.outline() });
      else if (typeof input === "number") port.postMessage({ value: document.page(input) });
      else port.postMessage({ value: document.page(input.render, true, input.preserveIndent) });
    } catch (err) {
      const error = err instanceof Error ? err.message : "PDF parser failed";
      port.postMessage({ error, fatal: !(err instanceof PageFailure) });
    }
  });
}

// src/host/reader-render.ts
async function render(bytes, ordinal, signal, preserveIndent = false) {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 1e4) throw new RangeError("Invalid PDF page number");
  if (signal?.aborted) throw new DOMException("PDF render cancelled", "AbortError");
  let doc;
  try {
    doc = await openReaderPdf(bytes, signal);
    return await doc.renderPage(ordinal, preserveIndent);
  } catch (err) {
    if (signal?.aborted) throw new DOMException("PDF render cancelled", "AbortError");
    if (err instanceof RangeError) throw new RangeError("Invalid PDF page number");
    const busy = err?.code === "PDF_BUSY";
    throw Object.assign(new Error(busy ? "PDF renderer busy" : "PDF page unavailable"), { code: busy ? "PDF_BUSY" : "PDF_RENDER_FAILED" });
  } finally {
    await doc?.close();
  }
}

// src/host/parse-worker.ts
function startParseWorker(store, originals, open3, log) {
  let stopped = false, pending;
  async function tick() {
    const job = store.claim();
    if (!job) return;
    let doc, active4 = true;
    const heart = setInterval(() => {
      try {
        if (!store.renew(job.token)) active4 = false;
      } catch {
        active4 = false;
      }
    }, 4e3);
    try {
      const bytes = await originals.read(job.key, job.sha256, job.byteLength);
      if (stopped || !active4 || !store.renew(job.token)) return;
      doc = await open3(bytes);
      if (stopped || !active4 || !store.initialize(job.token, doc.numPages)) return;
      let consecutiveFailures = 0;
      while (!stopped && active4) {
        const page = store.next(job.token);
        if (page == null) break;
        if (!doc) {
          if (consecutiveFailures >= 3) {
            store.fail(job.token);
            break;
          }
          doc = await open3(bytes);
          if (!store.initialize(job.token, doc.numPages)) break;
        }
        let result;
        try {
          result = await doc.page(page);
          consecutiveFailures = 0;
        } catch {
          result = null;
          consecutiveFailures++;
          await doc.close();
          doc = void 0;
        }
        if (stopped || !active4 || !store.publish(job.token, page, result)) break;
        await new Promise((resolve2) => setImmediate(resolve2));
      }
    } catch {
      if (!stopped && active4) store.fail(job.token);
    } finally {
      clearInterval(heart);
      await doc?.close();
    }
  }
  const timer = setInterval(() => {
    if (!stopped && !pending) pending = tick().catch(() => log("knowledgeos-parse: worker temporarily unavailable")).finally(() => {
      pending = void 0;
    });
  }, 500);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}

// src/host/office-worker.ts
var maxPdf = 64 * 1024 * 1024;
var knownCodes = /* @__PURE__ */ new Set(["input-too-large", "output-too-large", "invalid-document", "unsupported-format", "invalid-output", "timeout", "unavailable", "failed", "busy", "source-changed", "invalid-request"]);
var same2 = (a, b) => a.assetId === b.assetId && a.versionId === b.versionId && a.key === b.key && a.sha256 === b.sha256 && a.byteLength === b.byteLength && a.extension === b.extension;
function startOfficeWorker(store, originals, kit, openPdf2, log) {
  let stopped = false, pending, active4;
  async function tick() {
    const job = store.claim();
    if (!job) return;
    const { token: token2 } = job, controller = new AbortController();
    active4 = controller;
    const source = () => {
      controller.signal.throwIfAborted();
      const s = store.source(token2);
      if (!s) {
        controller.abort();
        controller.signal.throwIfAborted();
        throw Error("source unavailable");
      }
      return s;
    };
    const heartbeat = setInterval(() => {
      try {
        if (!store.renew(token2)) controller.abort();
      } catch {
        controller.abort();
      }
    }, 2e3);
    heartbeat.unref();
    let stage, doc, phase = "SOURCE_UNAVAILABLE";
    try {
      const initial = source(), checked = () => {
        const s = source();
        if (!same2(initial, s)) throw Error("source changed");
        return s;
      };
      phase = "CONVERSION_FAILED";
      const result = await kit.convert({ extension: initial.extension, priority: "background", source: {
        key: `knowledgeos:${initial.assetId}:${initial.versionId}`,
        version: initial.sha256,
        bytes: initial.byteLength,
        read: async (signal, maxBytes) => {
          signal.throwIfAborted();
          const s = checked();
          if (!Number.isSafeInteger(maxBytes) || maxBytes < s.byteLength) throw Error("source exceeds reservation");
          const bytes = await originals.read(s.key, s.sha256, s.byteLength);
          signal.throwIfAborted();
          const after = checked();
          return { bytes, version: after.sha256 };
        }
      } }, controller.signal);
      checked();
      phase = "INVALID_OFFICE_RESULT";
      if (!(result.pdf instanceof Uint8Array) || !result.pdf.byteLength || result.pdf.byteLength > maxPdf || !Array.isArray(result.missingFonts) || result.missingFonts.length > 1024 || result.missingFonts.some((f) => typeof f !== "string" || f.length > 512)) throw Error("invalid result");
      doc = await openPdf2(result.pdf);
      const pages = doc.numPages;
      if (!Number.isSafeInteger(pages) || pages < 1 || pages > 1e4) throw Error("invalid page count");
      for (let n = 1; n <= pages; n++) {
        controller.signal.throwIfAborted();
        await doc.page(n);
      }
      await doc.close();
      doc = void 0;
      checked();
      phase = "RESULT_STORAGE_UNAVAILABLE";
      stage = await originals.put(result.pdf);
      checked();
      let committed;
      try {
        committed = store.complete(token2, stage, pages, result.missingFonts);
      } catch (e) {
        if (!(e instanceof AssetError)) {
          originals.retain(stage.key);
          stage = void 0;
        }
        throw e;
      }
      if (committed) {
        originals.retain(stage.key);
        stage = void 0;
      }
    } catch (e) {
      if (!stopped && !controller.signal.aborted) {
        const code = e?.code;
        store.fail(token2, typeof code === "string" && knownCodes.has(code) ? code : phase);
      }
    } finally {
      clearInterval(heartbeat);
      active4 = void 0;
      try {
        if (stage) await originals.discard(stage.key);
      } finally {
        await doc?.close();
      }
    }
  }
  const timer = setInterval(() => {
    if (!stopped && !pending) pending = tick().catch(() => log("knowledgeos-office: worker temporarily unavailable")).finally(() => {
      pending = void 0;
    });
  }, 300);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    active4?.abort();
    await pending;
  };
}

// src/host/legacy-word-source.ts
import { randomUUID as randomUUID24 } from "node:crypto";
import { open as open2, unlink } from "node:fs/promises";
function legacyWordSource(kit, originals) {
  return async (source, check, signal) => {
    if (!kit.convertTo) throw new Error("Office structure conversion unavailable");
    const result = await kit.convertTo({ extension: "doc", format: "docx", output: { owner: randomUUID24(), name: "structure.docx" }, source: {
      key: `knowledgeos-word-structure:${source.sha256}`,
      version: source.sha256,
      bytes: source.byteLength,
      async read(active4, maxBytes) {
        active4.throwIfAborted();
        check();
        if (source.byteLength > maxBytes) throw new Error("Office source exceeds reservation");
        const bytes = await originals.read(source.key, source.sha256, source.byteLength);
        active4.throwIfAborted();
        check();
        return { bytes, version: source.sha256 };
      }
    } }, signal);
    try {
      signal.throwIfAborted();
      check();
      if (!Number.isSafeInteger(result.bytes) || result.bytes < 1 || result.bytes > 32 * 1024 * 1024) throw new Error("Office structure exceeds limit");
      const file = await open2(result.path, "r");
      try {
        if ((await file.stat()).size !== result.bytes) throw new Error("Office structure changed");
        const bytes = Buffer.alloc(result.bytes + 1), { bytesRead } = await file.read({ buffer: bytes, length: bytes.length, position: 0 });
        if (bytesRead !== result.bytes) throw new Error("Office structure changed");
        return bytes.subarray(0, bytesRead);
      } finally {
        await file.close();
      }
    } finally {
      await unlink(result.path).catch(() => {
      });
    }
  };
}

// src/host/library-page.ts
function buildLibraryHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PDF 资料库 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;color:#223638;background:#f8faf9;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:#fff;border-bottom:1px solid #d2ddda}header>div,main{max-width:900px;margin:auto;padding:0 22px}header>div,nav,.bar,.links{display:flex;align-items:center;gap:18px;flex-wrap:wrap}header>div{justify-content:space-between;min-height:54px;padding-block:8px}header strong{color:#18565a;font-size:19px}a{color:#176166;text-underline-offset:3px}main{padding-block:24px}h1,h2,p,dl{margin:0}h1{font-size:26px}h2{font-size:18px}section{margin-top:20px;border-top:1px solid #cbd9d6;padding-top:16px}.bar{justify-content:space-between;gap:8px}.muted,dt,small{color:#536866}#who{overflow-wrap:anywhere}form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) auto;align-items:end;gap:12px;margin-top:12px}label{display:grid;gap:5px;font-weight:600}input,select,button{font:inherit}input,select{width:100%;min-width:0;color:inherit;background:white;border:1px solid #889f9c;border-radius:5px;padding:7px;height:42px}input::file-selector-button{border:0;border-right:1px solid #ccd8d5;background:white;color:#18565a;margin-right:8px;padding:2px 8px 2px 0}button{border:1px solid #698c88;border-radius:5px;padding:6px 12px;background:white;color:#215c5c;cursor:pointer}button[type=submit]{background:#226461;color:white;height:42px}button:disabled,input:disabled,select:disabled{opacity:.6;cursor:default}:focus-visible{outline:3px solid #176d92;outline-offset:3px}#status{margin-top:12px;border-left:3px solid #9ebcb4;padding-left:9px;color:#354d48}#status[data-error]{border-color:#ae622e;color:#794019}#receipt{border-color:#669d90}.entry{padding:12px 0;overflow-wrap:anywhere}.entry+.entry{border-top:1px solid #dde5e2}.entry strong{display:block}.entry dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 12px;margin:5px 0}.entry dd{margin:0}.hash{font:13px/1.7 Consolas,monospace}.links{gap:15px;margin-top:6px}#list>p{padding-block:12px}[hidden]{display:none!important}@media(max-width:640px){header>div,main{padding-inline:14px}main{padding-top:18px}form{grid-template-columns:minmax(0,1fr)}form button{justify-self:start}nav{gap:12px}}
#parse-picker{margin:8px 0;max-width:36rem}#parse-panel{overflow-wrap:anywhere}#parse-panel .links{gap:8px}#parse-pages{list-style:none;margin:8px 0;padding:0}#parse-pages li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;border-top:1px solid #dde5e2;padding:6px 0}#parse-pages strong{min-width:5em}#parse-pages small{flex-basis:100%}#parse-note{color:#794019}
#parse-plan{display:flex;flex-wrap:wrap;align-items:end;gap:8px 14px;margin-block:8px}#parse-ranges-field{flex:1 1 16rem}#parse-ranges{width:100%}#parse-chapters{display:flex;gap:6px 14px;flex-wrap:wrap;max-height:10em;overflow:auto;margin:6px 0}
#mode-picker,#block-picker{max-width:36rem;margin-top:8px}#encoding-picker{grid-column:1/-1;max-width:24rem}#blocks li{padding-block:6px;border-bottom:1px solid #dde5e2}#blocks pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0;font:inherit}#reader{overflow-wrap:anywhere}
#office{overflow-wrap:anywhere}#office-version{max-width:36rem}#office-notes li{white-space:pre-wrap}#office-note-form{grid-template-columns:minmax(5rem,7rem) minmax(0,1fr) auto}#office-body{font:inherit;min-width:0;width:100%;resize:vertical;padding:6px;border:1px solid #889f9c;border-radius:5px}@media(max-width:640px){#office-note-form{grid-template-columns:minmax(0,1fr)}}
#zip{overflow-wrap:anywhere}#zip-resume{max-width:36rem}#zip-entries{list-style:none;padding:0}#zip-entries li{border-bottom:1px solid #dde5e2;padding:8px 0}#zip-entries label{display:flex;align-items:center;gap:8px}#zip-entries input{width:18px;height:18px;flex:none}#zip-entries small{display:block}
#search-form{grid-template-columns:minmax(0,1fr) auto}#search-results{list-style:none;padding:0;margin:4px 0;overflow-wrap:anywhere}#search-results li{padding:8px 0;border-bottom:1px solid #dde5e2}#search-results small{margin-inline-start:8px}#search-results p{white-space:pre-wrap}#search-status{min-height:1.55em;margin-top:6px;color:#536866}
</style></head><body>
<header><div><strong>KnowledgeOS</strong><nav aria-label="业务导航"><a href="/knowledgeos/notes">笔记</a><a href="/knowledgeos/recall">遮挡背诵</a><a href="/knowledgeos/invitations">邀请码</a><a href="/knowledgeos/account">账号与登录</a><a href="/knowledgeos/ai">AI 工具</a></nav></div></header>
<main><div class="bar"><h1>PDF 资料库</h1><span id="who" class="muted"></span></div>
<section aria-labelledby="search-heading"><h2 id="search-heading">全文检索</h2>
<form id="search-form"><label>关键词<input id="search-query" type="search" maxlength="128" disabled required></label><button id="search-submit" type="submit" disabled>检索</button></form>
<p id="search-status" role="status"></p><ul id="search-results"></ul></section>
<section aria-labelledby="import-heading"><h2 id="import-heading">导入原件</h2>
<label id="mode-picker">导入格式<select id="mode" disabled><option value="pdf">PDF</option><option value="text">Markdown / 纯文本</option><option value="word">Word</option><option value="zip">ZIP 压缩包</option></select></label>
<form id="import"><label id="encoding-picker" hidden>文本编码<select id="encoding" disabled><option value="">自动识别</option><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="gb18030">GB18030</option></select></label>
<label>导入到<select id="target" disabled><option value="">新建资料</option></select></label>
<label><span id="file-label">PDF 文件</span><input id="file" type="file" accept=".pdf,application/pdf" disabled></label>
<button id="submit" type="submit" disabled>导入 PDF</button></form>
<p id="status" role="status" aria-live="polite" aria-atomic="true">正在核对登录…</p></section>
<section id="zip" aria-labelledby="zip-heading" hidden><h2 id="zip-heading">压缩包清单</h2>
<label>继续处理压缩包<select id="zip-resume"></select></label><div class="links"><button id="zip-refresh" type="button">刷新清单</button></div>
<p id="zip-status" role="status"></p><div id="zip-panel" hidden><strong id="zip-title"></strong><p id="zip-meta" class="muted"></p>
<ul id="zip-entries" aria-label="压缩包成员"></ul><div class="links"><button id="zip-commit" type="button">导入所选文件</button><span id="zip-count"></span></div></div></section>
<section id="receipt" aria-labelledby="receipt-heading" hidden><h2 id="receipt-heading">导入回执</h2><div id="result"></div></section>
<section id="office" aria-labelledby="office-heading" hidden><h2 id="office-heading">Word 转换与质量核对</h2>
<label for="office-version">Word 版本</label><select id="office-version"></select>
<div id="office-panel" hidden><p id="office-status" aria-live="polite" aria-atomic="true"></p>
<div class="links"><button id="office-action" type="button" hidden></button><button id="office-refresh" type="button">刷新转换状态</button></div>
<div id="office-result" hidden><h3>可用转换结果</h3><p id="office-quality"></p>
<div class="links"><a id="office-preview" target="_blank" rel="noopener">预览转换 PDF</a><a id="office-download" download>下载转换 PDF</a></div>
<h3>逐页质量记录</h3><ol id="office-notes" aria-label="逐页质量记录"></ol>
<button id="office-older-notes" type="button" hidden>查看更早质量记录</button>
<form id="office-note-form"><label>页码<input type="number" id="office-page" min="1" step="1" required></label>
<label>质量问题<textarea id="office-body" rows="2" required></textarea></label><button type="submit" id="office-save">保存质量记录</button></form></div>
<section id="office-history" aria-label="转换历史" hidden><h3>转换历史</h3><ol id="office-attempts"></ol>
<div class="links"><button id="office-older" type="button" hidden>更早转换</button><button id="office-newest" type="button" hidden>返回最近转换</button></div></section>
<section id="office-detail" aria-label="历史质量记录" hidden><h3 id="office-detail-title" tabindex="-1">历史质量记录</h3>
<a id="office-detail-pdf" target="_blank" rel="noopener">预览此记录的 PDF</a><ol id="office-detail-notes"></ol>
<div class="links"><button id="office-detail-older" type="button" hidden>更早记录</button><button id="office-detail-newest" type="button" hidden>最新记录</button>
<button id="office-detail-close" type="button">关闭历史记录</button></div></section><p id="office-nav-status" role="status"></p></div></section>
<section id="reader" aria-labelledby="reader-heading" hidden><h2 id="reader-heading">文本回读</h2>
<label id="block-picker">文本版本<select id="block-version"></select></label>
<p id="block-summary" aria-live="polite"></p><ol id="blocks" aria-label="文本块"></ol>
<div id="block-nav" class="links" hidden><button id="block-prev" type="button">上一页</button><button id="block-next" type="button">下一页</button></div>
<button id="block-retry" type="button" hidden>重试读取</button></section>
<section id="parse" aria-labelledby="parse-heading" hidden><h2 id="parse-heading">解析进度</h2>
<label id="parse-picker">资料版本<select id="parse-version"></select></label>
<div id="parse-panel" hidden><p id="parse-summary" aria-live="polite"></p><p id="parse-note" aria-live="polite"></p>
<div id="parse-plan" hidden><label>解析范围<select id="parse-mode"><option value="whole">整本</option><option value="chapters">分章</option></select></label>
<label id="parse-ranges-field" hidden>原书页段<input id="parse-ranges" maxlength="1400" placeholder="1-45, 46-98, 102"></label></div>
<div id="parse-chapters" aria-label="章节页段" hidden></div>
<div class="links"><button id="parse-action" type="button" hidden></button><button id="parse-refresh" type="button">刷新进度</button></div>
<ul id="parse-pages" aria-label="分章节页状态"></ul><div class="links" id="parse-nav" hidden><button id="parse-prev" type="button">上一组</button><span id="parse-range"></span><button id="parse-next" type="button">下一组</button></div></div></section>
<section aria-labelledby="list-heading"><div class="bar"><h2 id="list-heading">我的资料</h2><button id="refresh" type="button">刷新资料</button></div><div id="list"></div></section></main>
<script>(()=>{
'use strict';
const $ = id => document.getElementById(id);
const api = '/knowledge/v1/', file = $('file'), target = $('target');
const mode=$('mode'), encoding=$('encoding'), textTypes={md:'text/markdown',txt:'text/plain'};
const textMode=()=>mode.value==='text';
const wordTypes={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',doc:'application/msword'};
const wordMode=()=>mode.value==='word';
const zipMode=()=>mode.value==='zip';
function fileType(blob){
  if(!blob)return null;
  if(zipMode())return /\.zip$/i.test(blob.name)?'application/zip':null;
  const ext=/\.(pdf|md|txt|docx?)$/i.exec(blob.name)?.[1].toLowerCase();
  return textMode()?textTypes[ext] || null:wordMode()?wordTypes[ext] || null:ext==='pdf'?'application/pdf':null;
}
function drawMode(){
  const text=textMode(), word=wordMode();$('file-label').textContent=text?'文本文件':word?'Word 文件':'PDF 文件';
  file.accept=text?'.md,.txt,text/markdown,text/plain':word?['.docx','.doc',...Object.values(wordTypes)].join(','):'.pdf,application/pdf';
  $('encoding-picker').hidden=!text;$('submit').textContent=text?'导入文本':word?'导入 Word':'导入 PDF';
  target.parentElement.hidden=zipMode();$('zip').hidden=!zipMode();
  if(zipMode()){$('file-label').textContent='ZIP 文件';file.accept='.zip,application/zip';$('submit').textContent='预览压缩包'}
}
let owner = null, generation = 0, busy = false, ready = false, key = null, conflict = false, rows = [];
let searchSequence=0, searchReceipt=null, searchChecking=false;
function status(text,error=false){ $('status').textContent=text; $('status').toggleAttribute('data-error',error) }
function controls(){
  mode.disabled = file.disabled = target.disabled = !ready || busy;
  encoding.disabled = file.disabled || !textMode();
  $('office-version').disabled = $('block-version').disabled = $('parse-version').disabled = !ready || busy;
  $('submit').disabled = file.disabled || !key || conflict;
  $('refresh').disabled = busy;
  $('search-query').disabled=$('search-submit').disabled=!ready||busy;
  if(zipMode()){target.disabled=true;zipControls()}
}
function clearDraft(){ file.value=''; encoding.value=''; key=null; conflict=false }
function clearPrivate(){
  clearSearch();$('search-query').value='';
  clearZip();clearOffice();clearParse();clearReader();mode.value='pdf';drawMode();
  owner=null; ready=false; rows=[]; clearDraft(); target.replaceChildren(new Option('新建资料',''));
  $('who').textContent=''; $('receipt').hidden=true; $('result').replaceChildren(); $('list').replaceChildren();
}
function signedOut(){ ++generation; busy=false; clearPrivate(); controls(); status('请先登录：前往「账号与登录」，登录后刷新资料。',true) }
function problem(http){ return Object.assign(new Error(),{http}) }
async function request(path,options,readBody=true){
  const r=await fetch(api+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
  if(!r.ok) throw problem(r.status);
  if(readBody)return (await r.json()).data;
}
async function me(){ const m=await request('me'); if(!m || typeof m.id!=='string' || !m.id)throw problem(502); return m }
// Every asynchronous commit belongs to both an operation and the same session principal.
async function confirmOwner(gen){
  return checkOwnerWhile(()=>gen===generation);
}
async function checkOwnerWhile(current){
  if(!current())return false;
  const m=await me(); if(!current())return false;
  if(m.id!==owner){ void load(true); return false } return true;
}
function fail(e,gen,upload){
  if(gen!==generation)return;
  if(e.http===401){signedOut();return}
  if(e.http===403 || e.http===404){
    ++generation; busy=false; clearPrivate(); controls(); status('资料不可访问。请核对账号和权限，再刷新资料。',true); return;
  }
  if(!upload){status('无法读取资料。请检查连接后刷新资料。',true);return}
  const format=zipMode()?'ZIP 压缩包':textMode()?'文本文件':wordMode()?'Word 文件':'PDF';
  const hint={400:'文件或导入信息无效，请重新选择'+format+'。',409:'资料或请求状态已变化，请刷新资料后核对版本再导入。',413:'文件过大，请重新选择较小的'+format+'。',415:'格式不受支持，请重新选择'+format+'。',422:textMode()?'无法导入此文本，请核对编码或重新选择文件。':'无法导入此文件，请重新选择有效的 PDF。',507:'存储空间不足，请联系管理员释放空间后重试。'};
  if(e.http===409)conflict=true;
  status(zipMode() && e.http===422?'压缩包无效或超出安全限制，未导入任何文件。':wordMode() && e.http===422?'无法导入此 Word 文件，请核对原件后重新选择。':hint[e.http] || '未收到有效回执。请检查连接或服务状态，保留当前选择并重试。',true);
}
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function clearSearch(message=''){
  searchSequence++;searchReceipt=null;$('search-results').replaceChildren();$('search-status').textContent=message;
}
function searchRecord(r){
  if(!r||!uuid.test(r.asset_id)||!uuid.test(r.version_id)||!Number.isSafeInteger(r.version)||r.version<1||
    !Number.isSafeInteger(r.ordinal)||r.ordinal<1||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start||
    typeof r.title!=='string'||typeof r.snippet!=='string'||typeof r.quote!=='string'||!['pdf','text','office'].includes(r.kind)||
    (r.kind==='office'?!uuid.test(r.conversion_id):r.conversion_id!==undefined)||!/^[a-f0-9]{64}$/.test(r.source_hash))throw problem(502);
  const li=document.createElement('li'),a=document.createElement('a'),meta=document.createElement('small'),p=document.createElement('p');
  a.href='/knowledgeos/reader?'+new URLSearchParams({asset:r.asset_id,version:r.version_id,unit:String(r.ordinal),
    ...(r.kind==='office'?{conversion:r.conversion_id}:{}),match:r.start+':'+r.end+':'+r.source_hash});
  a.textContent=r.title;meta.textContent='v'+r.version+' · '+(r.kind==='text'?'文本块 '+r.ordinal:(r.kind==='office'?'转换件 · ':'')+'第 '+r.ordinal+' 页');
  p.textContent=r.snippet;li.append(a,meta,p);return li;
}
$('search-form').onsubmit=async e=>{
  e.preventDefault();const query=$('search-query').value.trim();if(!ready||!owner||!query||document.hidden)return;
  clearSearch('检索中…');const s=searchSequence,gen=generation,actor=owner;
  const current=()=>s===searchSequence&&gen===generation&&actor===owner&&!document.hidden;
  try{
    const data=await request('search',{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1'},body:JSON.stringify({query})});
    if(!await checkOwnerWhile(current))return;
    if(data?.actor_id!==actor||!uuid.test(data.query_id)||!Array.isArray(data.items)||data.items.length>30)throw problem(502);
    const nodes=data.items.map(searchRecord),access=await request('search/'+data.query_id+'/access',{signal:AbortSignal.timeout(2500)});
    if(!current()||access?.actor_id!==actor||access.query_id!==data.query_id)return;
    $('search-results').replaceChildren(...nodes);searchReceipt=nodes.length?data.query_id:null;
    $('search-status').textContent=nodes.length?'显示 '+nodes.length+' 条':'没有匹配的可访问内容。';
  }catch(e){if(current())clearSearch(e.http===422?'请输入有效关键词。':'无法确认检索结果，请重试。')}
};
$('search-query').oninput=()=>clearSearch();
async function checkSearch(){
  const id=searchReceipt,s=searchSequence,actor=owner;
  if(!id||document.hidden||searchChecking)return;
  searchChecking=true;
  try{const a=await request('search/'+id+'/access',{signal:AbortSignal.timeout(2500)});
    if(s===searchSequence&&(a?.actor_id!==actor||a.query_id!==id))clearSearch('检索权限已变化，请重查。');
  }catch{if(s===searchSequence)clearSearch('无法确认检索权限，请重查。')}
  finally{searchChecking=false}
}
function record(r){
  if(!r || !uuid.test(r.id) || !uuid.test(r.version_id) || typeof r.title!=='string' || !Number.isSafeInteger(r.version) || r.version<1 || !Number.isSafeInteger(r.byte_length) || r.byte_length<0 || !/^[a-f\d]{64}$/i.test(r.sha256))throw problem(502);
  return {...r,media_type:r.media_type===undefined?'application/pdf':r.media_type};
}
const isPdf=r=>r.media_type==='application/pdf', isText=r=>Object.values(textTypes).includes(r.media_type);
const isWord=r=>Object.values(wordTypes).includes(r.media_type);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function readLink(r,label,params={}){const a=el('a',label);a.href='/knowledgeos/reader?'+new URLSearchParams({asset:r.id,version:r.version_id,...params});return a}
function entry(r,withReader=false){
  const node=el('div',null,'entry'), meta=el('dl'), links=el('div',null,'links');
  for(const [label,value] of [['版本','v'+r.version],['大小',r.byte_length+' 字节'],['SHA-256',r.sha256]])
    meta.append(el('dt',label),el('dd',value,label==='SHA-256'?'hash':''));
  const path=api+'assets/'+r.id+'/versions/'+r.version_id+'/original';
  if(withReader)links.append(readLink(r,'打开阅读'));
  if(isPdf(r)){const view=el('a','查看原件');view.href=path;view.target='_blank';view.rel='noopener';links.append(view)}
  const save=el('a',isPdf(r)?'导出 PDF':'导出原件');save.href=path+'?download=1';save.download='';links.append(save);
  node.append(el('strong',r.title),meta,links);return node;
}
function head(id){return rows.find(r=>r.id===id)}
const archive=$('zip-resume'), zipStates={available:'可选择',selected:'待导入',imported:'已导入',failed:'导入失败'};
const archiveStates={staged:'待选择',selected:'导入中',partial:'有失败项',imported:'已导入所选文件'};
const zipReasons={ZIP_DIRECTORY:'目录',ZIP_UNSUPPORTED_MEDIA:'不支持此文件格式',ZIP_INTEGRITY:'内容校验失败，请重新打包',ZIP_NESTED_ARCHIVE:'不支持嵌套压缩包',INVALID_WORD:'Word 文件无效',INVALID_PDF:'PDF 文件无效',INVALID_FILENAME:'文件名过长',TEXT_TOO_LARGE:'文本超出大小限制',TEXT_BINARY:'包含非文本内容',TEXT_INVALID_ENCODING:'文本编码无效',TEXT_INVALID_INPUT:'文本内容无效'};
let zipSeq=0, manifest=null, picked=new Set(), retrySelection=null;
function clearManifest(){
  manifest=null;picked.clear();retrySelection=null;$('zip-panel').hidden=true;
  for(const id of ['zip-title','zip-meta','zip-status','zip-count','zip-entries'])$(id).replaceChildren();
}
function clearZip(){++zipSeq;clearManifest();archive.replaceChildren(new Option('选择压缩包',''))}
function zipControls(){
  archive.disabled=$('zip-refresh').disabled=busy || !ready;
  $('zip-commit').disabled=busy || !ready || !manifest || !picked.size;
  $('zip-commit').textContent=retrySelection?'重试上次提交':'导入所选文件';
  $('zip-count').textContent='已勾选 '+picked.size+' 项';
  for(const input of $('zip-entries').querySelectorAll('input'))input.disabled=busy || !ready || !!retrySelection || input.dataset.eligible!=='yes';
}
function zipHeader(d){
  if(!d || !uuid.test(d.id) || typeof d.title!=='string' || !/^[a-f\d]{64}$/i.test(d.sha256))throw problem(502);
  return d;
}
const zipSize=n=>Number.isSafeInteger(n)&&n>=0;
function showManifest(d,expected,previous=new Set()){
  zipHeader(d);if((expected && d.id!==expected) || typeof d.state!=='string' || !zipSize(d.byte_length) || !Array.isArray(d.entries))throw problem(502);
  const seen=new Set(),counts={selected:0,imported:0,failed:0},next=new Set();
  const nodes=d.entries.map(e=>{
    if(!e || !uuid.test(e.id) || seen.has(e.id) || typeof e.path!=='string' || typeof e.name!=='string' ||
      !zipSize(e.size) || !zipSize(e.compressed_size) || !Object.hasOwn(zipStates,e.state) ||
      !(e.reason===null || typeof e.reason==='string') || !(e.media_type===null || typeof e.media_type==='string'))throw problem(502);
    seen.add(e.id);if(Object.hasOwn(counts,e.state))counts[e.state]++;
    const eligible=e.reason===null && e.state!=='imported',li=el('li'),label=el('label'),input=el('input');
    input.type='checkbox';input.value=e.id;input.dataset.eligible=eligible?'yes':'no';
    input.checked=eligible && (e.state==='selected' || previous.has(e.id));if(input.checked)next.add(e.id);
    input.onchange=()=>{if(manifest!==d || !eligible || busy || retrySelection)return;if(input.checked)picked.add(e.id);else picked.delete(e.id);zipControls()};
    label.append(input,el('span',e.path));li.append(label,el('small','原始名称：'+e.name+' · '+e.size+' 字节（压缩后 '+e.compressed_size+' 字节）'+(e.media_type?' · '+e.media_type:'')));
    li.append(el('span',e.reason!==null?'不可导入：'+(zipReasons[e.reason]??e.reason):zipStates[e.state]+(e.error?'：'+(zipReasons[e.error]??e.error):'')));
    if(e.state==='imported' && e.receipt)li.append(entry(record(e.receipt)));
    return li;
  });
  const opt=Array.from(archive.options).find(o=>o.value===d.id),caption=d.title+' · '+(archiveStates[d.state]??d.state);if(opt)opt.textContent=caption;else archive.add(new Option(caption,d.id));archive.value=d.id;
  manifest=d;picked=next;retrySelection=null;$('zip-title').textContent=d.title;$('zip-meta').textContent=d.byte_length+' 字节 · SHA-256 '+d.sha256;
  $('zip-status').textContent='共 '+nodes.length+' 项 · 待导入 '+counts.selected+' · 已导入 '+counts.imported+' · 失败 '+counts.failed;
  $('zip-entries').replaceChildren(...nodes);$('zip-panel').hidden=false;zipControls();
}
async function readZip(id=''){
  if(!zipMode() || !ready || busy)return;
  const seq=++zipSeq,current=()=>seq===zipSeq && zipMode();clearManifest();$('zip-status').textContent='正在读取清单…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request(id?'imports/'+id+'/entries':'imports');if(!await checkOwnerWhile(current))return;
    if(id)showManifest(data,id);
    else{
      if(!Array.isArray(data?.items))throw problem(502);
      const opts=data.items.map(zipHeader).map(d=>new Option(d.title+(typeof d.state==='string'?' · '+(archiveStates[d.state]??d.state):''),d.id));
      archive.replaceChildren(new Option('选择压缩包',''),...opts);$('zip-status').textContent=opts.length?'请选择要继续处理的压缩包。':'暂无压缩包。';
    }
  }catch(e){if(!current())return;if([401,403,404].includes(e.http))fail(e,generation,false);else $('zip-status').textContent='清单读取失败，请刷新重试。'}
}
archive.onchange=()=>void readZip(archive.value);$('zip-refresh').onclick=()=>void readZip(archive.value);
$('zip-commit').onclick=async()=>{
  if(!ready || busy || !zipMode() || !manifest || !picked.size)return;
  const id=manifest.id,gen=++generation,seq=++zipSeq,current=()=>seq===zipSeq && gen===generation;
  const attempt=retrySelection || {key:crypto.randomUUID(),ids:[...picked].sort()};retrySelection=attempt;
  busy=true;controls();$('zip-status').textContent='正在导入 '+attempt.ids.length+' 项…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request('imports/'+id+'/selection',{method:'POST',headers:{'x-knowledgeos-request':'1','content-type':'application/json','idempotency-key':attempt.key},body:JSON.stringify({entry_ids:attempt.ids})});
    if(!await checkOwnerWhile(current))return;
    showManifest(data,id,new Set(attempt.ids));
    // Only published receipts enter the ordinary version pickers, never a preview row.
    const added=data.entries.filter(e=>e.state==='imported' && e.receipt).map(e=>record(e.receipt));
    if(added.length){const ids=new Set(added.map(r=>r.version_id));clearOffice();clearReader();clearParse();renderRows([...added,...rows.filter(r=>!ids.has(r.version_id))],target.value)}
  }catch(e){if(!current())return;if([401,403,404].includes(e.http))fail(e,gen,false);
    else $('zip-status').textContent='未确认导入结果。可重试上次提交，或刷新清单核对已导入项。';
  }finally{if(current()){busy=false;controls()}}
};
const docStates={idle:'未开始',queued:'排队中',running:'解析中',complete:'解析完成',partial:'部分完成',failed:'解析失败',cancelled:'已取消'};
const pageStates={pending:'未处理',ready:'可用',review:'待复核',failed:'失败'};
const pageSize=25, parseVersion=$('parse-version'), writes=new Map();
let selection=null, pollTimer;
function clearParse(){
  clearTimeout(pollTimer);selection=null;parseVersion.replaceChildren();$('parse').hidden=true;resetPanel();
}
function resetPanel(){
  $('parse-panel').hidden=true;$('parse-action').hidden=true;$('parse-nav').hidden=true;
  $('parse-plan').hidden=$('parse-chapters').hidden=true;$('parse-chapters').replaceChildren();
  $('parse-summary').textContent='';$('parse-note').textContent='';$('parse-pages').replaceChildren();$('parse-range').textContent='';
}
function progress(data){
  const nullableText=v=>v===null || typeof v==='string';
  if(!data || !Object.hasOwn(docStates,data.state) || !Number.isSafeInteger(data.total) || data.total<0 || !nullableText(data.error) || !Array.isArray(data.pages))throw problem(502);
  const seen=new Set(), counts={pending:0,ready:0,review:0,failed:0};let outside=0;
  const chapters=data.chapters===undefined?[]:data.chapters;
  if(!Array.isArray(chapters)||chapters.length>100||chapters.some((r,i)=>!Array.isArray(r)||r.length!==2||!r.every(Number.isSafeInteger)||r[0]<1||r[1]<r[0]||r[1]>10000||i>0&&chapters[i-1][1]>=r[0]))throw problem(502);
  for(const p of data.pages){
    if(!p || !Number.isSafeInteger(p.page) || p.page<1 || p.page>data.total || seen.has(p.page) || !Object.hasOwn(pageStates,p.state) || typeof p.chapter!=='string' || !nullableText(p.error))throw problem(502);
    if(chapters.length&&p.selected!==Number(chapters.some(([a,b])=>p.page>=a&&p.page<=b)))throw problem(502);
    seen.add(p.page);if(p.selected===0)outside++;else ++counts[p.state];
  }
  return {...data,counts,outside,chapters,pages:data.pages.sort((a,b)=>a.page-b.page)};
}
function activeJob(state){return state==='queued' || state==='running'}
function drawPages(s){
  const {pages,state}=s.data, last=Math.max(0,Math.ceil(pages.length/pageSize)-1);
  s.group=Math.min(last,Math.max(0,s.group));const from=s.group*pageSize, end=Math.min(from+pageSize,pages.length);
  const items=pages.slice(from,end).map(p=>{
    const li=el('li');li.append(el('strong','第 '+p.page+' 页'),el('span',p.selected===0?'未选':pageStates[p.state]),el('span',p.chapter));
    if(p.state==='ready'||p.state==='review')li.append(readLink(s.row,'阅读第 '+p.page+' 页',{unit:p.page}));
    if(state==='partial' && (p.state==='failed' || p.state==='review')){
      const retry=el('button','重试第 '+p.page+' 页');retry.type='button';retry.disabled=s.writing;
      retry.onclick=()=>requestProgress(s,'/retry/'+p.page);li.append(retry);
    }
    if(p.error)li.append(el('small',p.error));return li;
  });
  $('parse-pages').replaceChildren(...items);$('parse-nav').hidden=last===0;
  $('parse-prev').disabled=s.group===0;$('parse-next').disabled=s.group===last;
  $('parse-range').textContent=pages.length?'第 '+(from+1)+'–'+end+' 条，共 '+pages.length+' 条':'';
}
function drawProgress(s){
  const {state,total,counts,error,outside,chapters,pages}=s.data, action=$('parse-action');
  const editable=state==='idle'||error==='CHAPTER_RANGE_OUTSIDE_DOCUMENT';
  const sectionMode=$('parse-mode');$('parse-plan').hidden=!editable;
  sectionMode.disabled=s.writing||state!=='idle';if(state!=='idle'&&editable)sectionMode.value='chapters';
  $('parse-ranges-field').hidden=sectionMode.value!=='chapters';$('parse-ranges').disabled=s.writing;
  const chapterList=$('parse-chapters');chapterList.hidden=!chapters.length;
  chapterList.replaceChildren(...chapters.map(([a,b],i)=>{
    const label='分段 '+(i+1)+' · '+a+(a===b?'':'–'+b)+' 页';
    const first=pages.find(p=>p.page>=a&&p.page<=b&&['ready','review'].includes(p.state));
    return first?readLink(s.row,label,{unit:first.page}):el('span',label);
  }));
  const summary=docStates[state]+' · 共 '+total+' 页'+Object.keys(pageStates).map(k=>' · '+pageStates[k]+' '+counts[k]).join('')+(chapters.length?' · 未选 '+outside:'');
  if($('parse-summary').textContent!==summary)$('parse-summary').textContent=summary;
  $('parse-note').textContent=error==='CHAPTER_RANGE_OUTSIDE_DOCUMENT'?'页段超出原件页数。':error || '';
  const labels={idle:'开始解析',queued:'取消解析',running:'取消解析',failed:'重新解析',cancelled:'继续解析'};
  action.hidden=!labels[state];action.textContent=labels[state] || '';action.disabled=action.hidden || s.writing;
  action.onclick=action.hidden?null:()=>{
    if(editable&&sectionMode.value==='chapters'){
      const pieces=$('parse-ranges').value.normalize('NFKC').trim().split(/\s*[,、]\s*/);
      if(pieces.length>100||pieces.some(v=>!/^\d{1,5}(?:\s*[-–]\s*\d{1,5})?$/.test(v))){$('parse-note').textContent='原书页段格式无效。';return}
      const ranges=pieces.map(v=>{const [a,b]=v.split(/[-–]/).map(Number);return [a,b??a]});
      if(ranges.some(([a,b],i)=>a<1||b<a||b>10000||i>0&&ranges[i-1][1]>=a)){$('parse-note').textContent='页段须按原书顺序排列，且不能重叠。';return}
      void requestProgress(s,'/chapters',ranges);return;
    }
    void requestProgress(s,activeJob(state)?'/cancel':'/start');
  };drawPages(s);
}
async function requestProgress(s,action='',ranges){
  if(selection!==s || s.writing)return;
  clearTimeout(pollTimer);const seq=++s.seq, current=()=>selection===s && s.seq===seq;
  s.writing=!!action;$('parse-refresh').disabled=true;
  if(s.writing){drawProgress(s);$('parse-note').textContent='正在提交…'}
  try{
    // Returning to a version while its previous POST is in flight must read after that write.
    if(writes.has(s.path))await writes.get(s.path);
    if(!await checkOwnerWhile(current))return;
    const req=request(s.path+action,action?{method:'POST',headers:{'x-knowledgeos-request':'1',...(ranges?{'content-type':'application/json'}:{})},
      ...(ranges?{body:JSON.stringify(ranges)}:{})}:undefined);
    if(action)writes.set(s.path,req.catch(()=>{}));
    let data;try{data=await req}finally{if(action)writes.delete(s.path)}
    if(!await checkOwnerWhile(current))return;
    s.data=progress(data);s.writing=false;drawProgress(s);
    if(activeJob(s.data.state))pollTimer=setTimeout(()=>requestProgress(s),2000);
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    s.data=null;s.group=0;resetPanel();$('parse-panel').hidden=false;
    $('parse-note').textContent='无法确认当前解析状态。请刷新进度后再操作。';
  }finally{if(current()){s.writing=false;$('parse-refresh').disabled=false}}
}
parseVersion.onchange=()=>{
  clearTimeout(pollTimer);selection=null;resetPanel();const r=rows.find(row=>row.version_id===parseVersion.value);
  if(!r || !isPdf(r) || !ready || busy)return;
  $('parse-mode').value='whole';$('parse-ranges').value='';
  selection={row:r,path:'assets/'+r.id+'/versions/'+r.version_id+'/parse',seq:0,group:0,writing:false,data:null};
  $('parse-panel').hidden=false;$('parse-summary').textContent='正在读取解析进度…';void requestProgress(selection);
};
$('parse-mode').onchange=()=>{if(selection?.data)drawProgress(selection)};
$('parse-refresh').onclick=()=>{if(selection)void requestProgress(selection)};
for(const [id,delta] of [['parse-prev',-1],['parse-next',1]])$(id).onclick=()=>{if(selection?.data){selection.group+=delta;drawPages(selection)}};
const blockVersion=$('block-version'), blockLimit=5;
let blockRequest=null;
function resetBlocks(){
  blockRequest=null;$('block-summary').textContent='';$('blocks').replaceChildren();$('block-nav').hidden=$('block-retry').hidden=true;
}
function clearReader(){resetBlocks();blockVersion.replaceChildren();$('reader').hidden=true}
function validateBlocks(data,r,from){
  if(!data || data.version_id!==r.version_id || typeof data.encoding!=='string' || !Number.isSafeInteger(data.total) || data.total<0 ||
    from>Math.max(1,data.total) || !Array.isArray(data.blocks) || data.blocks.length!==Math.min(blockLimit,data.total-from+1))throw problem(502);
  for(const [i,b] of data.blocks.entries()){
    if(!b || b.ordinal!==from+i || typeof b.kind!=='string' || typeof b.text!=='string' ||
      !Number.isSafeInteger(b.start) || !Number.isSafeInteger(b.end) || b.start<0 || b.end<b.start)throw problem(502);
  }
}
async function readBlocks(r,from){
  resetBlocks();const req={r,from};blockRequest=req;const current=()=>blockRequest===req;
  $('block-summary').textContent='正在读取文本块…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request('assets/'+r.id+'/versions/'+r.version_id+'/blocks?from='+from+'&limit='+blockLimit);
    if(!await checkOwnerWhile(current))return;
    validateBlocks(data,r,from);
    const end=from+data.blocks.length-1;
    $('block-summary').textContent=data.encoding+' · '+(data.total?'第 '+from+'–'+end+' 块，共 '+data.total+' 块':'暂无文本块');
    $('blocks').start=from;$('blocks').replaceChildren(...data.blocks.map(b=>{
      const li=el('li');li.append(el('small',b.kind+' · 字符偏移 ['+b.start+', '+b.end+')'),el('pre',b.text));
      if(typeof b.anchor==='string' && b.anchor)li.append(el('small','锚点：'+b.anchor));return li;
    }));
    $('block-prev').disabled=from===1;$('block-next').disabled=end>=data.total;$('block-nav').hidden=data.total<=blockLimit;
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    $('block-summary').textContent='无法读取文本块。';$('block-retry').hidden=false;
  }
}
blockVersion.onchange=()=>{
  const r=rows.find(row=>row.version_id===blockVersion.value);
  if(r && isText(r) && ready && !busy)void readBlocks(r,1);else resetBlocks();
};
for(const [id,delta] of [['block-prev',-blockLimit],['block-next',blockLimit],['block-retry',0]]){
  $(id).onclick=()=>{if(blockRequest)void readBlocks(blockRequest.r,blockRequest.from+delta)};
}
const officeVersion=$('office-version'), officeWrites=new Map();
const officeStates={queued:'排队中',running:'转换中',ready:'转换完成',failed:'转换失败',cancelled:'已取消',superseded:'源版本已变化'};
let office=null;
function resetOfficeResult(){
  $('office-result').hidden=true;$('office-quality').textContent='';$('office-notes').replaceChildren();
  $('office-older-notes').hidden=true;
  $('office-preview').removeAttribute('href');$('office-download').removeAttribute('href');
  $('office-body').value='';$('office-page').value='1';
}
function resetOffice(){
  clearTimeout(office?.timer);office=null;resetOfficeHistory();resetOfficeResult();$('office-panel').hidden=true;
  $('office-status').textContent='';$('office-action').hidden=true;$('office-refresh').disabled=false;
}
function clearOffice(){resetOffice();officeVersion.replaceChildren();$('office').hidden=true}
function officeData(data,version){
  if(data?.version_id!==version || !Array.isArray(data.conversions) || data.conversions.length>10 ||
    (data.next_before!==undefined && (!uuid.test(data.next_before)||data.next_before!==data.conversions.at(-1)?.id)))throw problem(502);
  const ids=new Set();
  if(data.latest_ready!==undefined && data.latest_ready?.state!=='ready')throw problem(502);
  for(const c of [...data.conversions,...(data.latest_ready?[data.latest_ready]:[])]){
    if(!c || typeof c.id!=='string' || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id) || !Object.hasOwn(officeStates,c.state) ||
      (c.page_count!=null && (!Number.isSafeInteger(c.page_count) || c.page_count<0)) || (c.state==='ready' && !(c.page_count>0)) ||
      (c.failure_code!=null && typeof c.failure_code!=='string') || !Array.isArray(c.missing_fonts) || !c.missing_fonts.every(f=>typeof f==='string') ||
      !Array.isArray(c.notes) || c.notes.length>10 || !c.notes.every(n=>n && Number.isSafeInteger(n.page) && n.page>=1 && n.page<=c.page_count && typeof n.body==='string') ||
      (c.notes_next_before!==undefined && (!uuid.test(c.notes_next_before)||c.notes_next_before!==c.notes[0]?.id)))throw problem(502);
    ids.add(c.id);
  }
  return data;
}
function closeOfficeDetail(){
  $('office-detail').hidden=true;$('office-detail-title').textContent='历史质量记录';
  $('office-detail-notes').replaceChildren();$('office-detail-pdf').removeAttribute('href');
}
function resetOfficeHistory(){
  closeOfficeDetail();$('office-history').hidden=true;$('office-attempts').replaceChildren();$('office-nav-status').textContent='';
}
function drawAttempts(s){
  const page=s.history||s.head,history=$('office-history');
  history.hidden=!s.history && page.conversions.length<2 && !page.next_before;
  $('office-older').hidden=!page.next_before;$('office-newest').hidden=!s.history;
  // Don't replace focused controls on every live status poll.
  const key=JSON.stringify(page.conversions.map(c=>[c.id,c.state,c.failure_code]));if(key===s.historyKey)return;s.historyKey=key;
  $('office-attempts').replaceChildren(...page.conversions.map(c=>{
    const li=el('li',officeStates[c.state]+' · '+c.id+(c.failure_code?' · '+c.failure_code:''));
    if(c.state==='ready'){
      const b=el('button','查看质量记录');b.type='button';b.setAttribute('aria-label','查看质量记录：'+c.id);
      b.onclick=()=>readOfficePage(s,{conversion:c.id});li.append(' ',b);
      li.append(' ',readLink(s.row,'阅读此转换',{conversion:c.id}));
    }
    return li;
  }));
}
const noteRows=c=>c.notes.map(n=>el('li','第 '+n.page+' 页：'+n.body));
async function readOfficePage(s,query){
  if(!s?.head)return;
  const token=++s.nav,current=()=>office===s && token===s.nav;
  $('office-nav-status').textContent='正在读取历史…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=officeData(await request(s.path+'?'+new URLSearchParams(query)),s.version);
    if(!await checkOwnerWhile(current))return;
    if(query.conversion){
      const c=data.conversions[0];if(data.conversions.length!==1 || c.id!==query.conversion || c.state!=='ready')throw problem(502);
      s.detail=c;$('office-detail-title').textContent='历史质量记录 · '+c.id;
      $('office-detail-pdf').href=api+s.path+'/'+c.id+'/pdf';$('office-detail-notes').replaceChildren(...noteRows(c));
      $('office-detail-older').hidden=!c.notes_next_before;$('office-detail-newest').hidden=!query.notes_before;
      $('office-detail').hidden=false;$('office-detail-title').focus();
    }else{
      s.history=data;s.detail=null;closeOfficeDetail();drawAttempts(s);
      $('office-newest').focus();
    }
    $('office-nav-status').textContent=query.conversion?'质量记录已刷新。':'已显示更早转换。';
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    $('office-nav-status').textContent='历史记录读取失败，请重试。';
  }
}
function officeControls(s){
  $('office-action').disabled=$('office-page').disabled=$('office-body').disabled=$('office-save').disabled=s.writing;
  $('office-refresh').disabled=s.writing;
}
function drawOffice(s,data){
  s.head=data;drawAttempts(s);
  const items=data.conversions,latest=items[0],result=data.latest_ready||items.find(c=>c.state==='ready');
  const statusText=latest?'最近一次：'+officeStates[latest.state]+(latest.failure_code?' · '+latest.failure_code:''):'尚未转换。';
  if($('office-status').textContent!==statusText)$('office-status').textContent=statusText;
  s.active=items.find(c=>activeJob(c.state));
  $('office-action').hidden=false;$('office-action').textContent=s.active?'取消转换':latest?'重新转换':'开始转换';
  // Bind the draft to the actual reviewed PDF, never silently move it to a new result.
  if(s.result?.id!==result?.id)resetOfficeResult();
  s.result=result;
  if(!result)return;
  const path=api+s.path+'/'+result.id+'/pdf';
  $('office-preview').href=path;$('office-download').href=path+'?download=1';
  $('office-result').hidden=false;$('office-page').max=String(result.page_count);
  $('office-quality').textContent=(result!==latest?'上一次可用结果':'当前可用结果')+' · '+result.page_count+' 页 · '+
    (result.missing_fonts.length?'缺失字体：'+result.missing_fonts.join('、'):'未报告缺失字体');
  $('office-notes').replaceChildren(...noteRows(result));$('office-older-notes').hidden=!result.notes_next_before;
}
$('office-older').onclick=()=>{const s=office;void readOfficePage(s,{before:(s.history||s.head).next_before})};
$('office-newest').onclick=()=>{const s=office;++s.nav;s.history=s.detail=null;closeOfficeDetail();drawAttempts(s);void syncOffice(s);$('office-nav-status').textContent='已返回最近转换。'};
$('office-older-notes').onclick=()=>{const c=office.result;void readOfficePage(office,{conversion:c.id,notes_before:c.notes_next_before})};
$('office-detail-older').onclick=()=>{const c=office.detail;void readOfficePage(office,{conversion:c.id,notes_before:c.notes_next_before})};
$('office-detail-newest').onclick=()=>void readOfficePage(office,{conversion:office.detail.id});
$('office-detail-close').onclick=()=>{++office.nav;office.detail=null;closeOfficeDetail();$('office-nav-status').textContent='';$('office-refresh').focus()};
async function syncOffice(s,action='',note=null){
  if(!s || s!==office || s.writing)return;
  clearTimeout(s.timer);const seq=++s.seq,current=()=>s===office && s.seq===seq;
  s.writing=!!action;officeControls(s);
  try{
    // A new selection of the same version must observe an already-dispatched write.
    if(officeWrites.has(s.path))await officeWrites.get(s.path);
    if(!await checkOwnerWhile(current))return;
    if(action){
      const headers={'x-knowledgeos-request':'1'};
      if(note || action==='/start')headers['idempotency-key']=crypto.randomUUID();
      if(note)headers['content-type']='application/json';
      const write=request(s.path+action,{method:'POST',headers,body:note?JSON.stringify(note):undefined},false);
      officeWrites.set(s.path,write.catch(()=>{}));
      try{await write}finally{officeWrites.delete(s.path)}
      if(!await checkOwnerWhile(current))return;
      if(note)$('office-body').value='';
    }
    const data=await request(s.path);
    if(!await checkOwnerWhile(current))return;
    drawOffice(s,officeData(data,s.version));
    if(s.active)s.timer=setTimeout(()=>syncOffice(s),2000);
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    ++s.nav;s.head=s.history=s.historyKey=s.detail=null;resetOfficeHistory();s.result=s.active=null;resetOfficeResult();$('office-action').hidden=true;
    $('office-status').textContent='无法确认转换状态，请刷新转换状态后再操作。';
  }finally{if(current()){s.writing=false;officeControls(s)}}
}
officeVersion.onchange=()=>{
  resetOffice();const r=rows.find(row=>row.version_id===officeVersion.value);
  if(!r || !isWord(r) || !ready || busy)return;
  office={row:r,version:r.version_id,path:'assets/'+r.id+'/versions/'+r.version_id+'/office',seq:0,nav:0,writing:false};
  $('office-panel').hidden=false;$('office-status').textContent='正在读取转换状态…';void syncOffice(office);
};
$('office-refresh').onclick=()=>void syncOffice(office);
$('office-action').onclick=()=>{if(office)void syncOffice(office,office.active?'/'+office.active.id+'/cancel':'/start')};
$('office-note-form').onsubmit=e=>{
  e.preventDefault();const r=office?.result,page=$('office-page').valueAsNumber,body=$('office-body').value.trim();
  if(!r || !Number.isSafeInteger(page) || page<1 || page>r.page_count)return;
  if(!body){$('office-body').focus();$('office-status').textContent='请输入质量问题。';return}
  void syncOffice(office,'/'+r.id+'/notes',{page,body});
};
function renderRows(items,selected){
  rows=items.slice().sort((a,b)=>b.version-a.version);
  const seen=new Set();target.replaceChildren(new Option('新建资料',''));
  for(const r of rows)if(!seen.has(r.id)){seen.add(r.id);target.add(new Option(r.title+' · v'+r.version,r.id))}
  target.value=seen.has(selected)?selected:'';
  $('list').replaceChildren(...(rows.length?rows.map(r=>entry(r,true)):[el('p','暂无资料','muted')]));
  for(const [select,section,predicate,prompt] of [[parseVersion,'parse',isPdf,'选择资料版本'],[blockVersion,'reader',isText,'选择文本版本'],[officeVersion,'office',isWord,'选择 Word 版本']]){
    const versions=rows.filter(predicate);select.replaceChildren(new Option(prompt,''),...versions.map(r=>new Option(r.title+' · v'+r.version,r.version_id)));
    $(section).hidden=!versions.length;
  }
}
async function load(reset=false){
  const gen=++generation;busy=true;clearZip();clearOffice();clearReader();clearParse();if(reset)clearPrivate();controls();status('正在读取资料…');
  try{
    const m=await me();if(gen!==generation)return;
    if(m.id!==owner)clearPrivate();owner=m.id;$('who').textContent=m.display_name || m.login_name || m.id;
    const selected=target.value, previous=head(selected), data=await request('assets');
    if(!await confirmOwner(gen))return;
    renderRows(data.items.map(record),selected);ready=true;
    if(conflict || (selected && head(selected)?.version!==previous?.version)){
      clearDraft();status('资料版本已刷新，请核对导入目标并重新选择文件。');
    }else status('资料已刷新。');
  }catch(e){if(gen===generation){ready=false;$('list').replaceChildren();fail(e,gen,false)}}
  finally{if(gen===generation){busy=false;controls();if(zipMode() && ready)void readZip()}}
}
function changed(){
  if(busy || !ready)return;
  ++generation;conflict=false;key=fileType(file.files[0])?crypto.randomUUID():null;controls();
  status(key?'文件已选择。':zipMode()?'请选择 .zip 压缩包。':textMode()?'请选择 .md 或 .txt 文本文件。':wordMode()?'请选择 .docx 或 .doc 文件。':'请选择 PDF 文件。',!!file.files[0] && !key);
}
mode.onchange=()=>{clearZip();clearDraft();drawMode();changed();if(zipMode())void readZip()};
for(const control of [file,target,encoding])control.addEventListener('change',changed);
$('refresh').onclick=()=>load();
$('import').onsubmit=async event=>{
  event.preventDefault();if(!ready || busy || conflict || !key || !file.files[0])return;
  const gen=++generation, selected=zipMode()?'':target.value, dest=head(selected), blob=file.files[0], type=fileType(blob);
  if(!type)return;if(zipMode()){++zipSeq;clearManifest();archive.value='';$('receipt').hidden=true}busy=true;controls();status(zipMode()?'正在上传并读取清单…':'正在导入…');
  try{
    if(!await confirmOwner(gen))return;
    const headers={'content-type':type,'x-knowledgeos-request':'1','x-knowledgeos-filename':encodeURIComponent(blob.name),'idempotency-key':key};
    if(textMode() && encoding.value)headers['x-knowledgeos-encoding']=encoding.value;
    if(selected){headers['x-knowledgeos-asset-id']=dest.id;headers['x-knowledgeos-expected-version']=String(dest.version)}
    const raw=await request('imports',{method:'POST',headers,body:blob});
    if(!await confirmOwner(gen))return;
    if(zipMode()){showManifest(raw);clearDraft();status('清单已就绪，请核对后选择文件。');return}
    const r=record(raw);clearDraft();clearOffice();clearParse();clearReader();renderRows([r,...rows.filter(old=>old.version_id!==r.version_id)],selected);
    $('result').replaceChildren(entry(r));$('receipt').hidden=false;status('导入成功，已接收 v'+r.version+'。');
  }catch(e){fail(e,gen,true)}finally{if(gen===generation){busy=false;controls()}}
};
function checkSession(){
  if(document.hidden)return;
  if(!owner){if(!busy)void load();return}
  const gen=generation;confirmOwner(gen).catch(e=>{if(gen!==generation)return;if(e.http===401)signedOut();else if(!busy)void load()});
}
window.addEventListener('focus',()=>{checkSession();void checkSearch()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearSearch();else checkSession()});
window.addEventListener('pagehide',()=>clearSearch());setInterval(checkSearch,2500);
window.addEventListener('pageshow',e=>{if(e.persisted)void load(true)});
void load();
})()</script></body></html>`;
}

// src/host/reader-page.ts
function buildReaderHtml() {
  return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>版本阅读 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7faf9;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}header,main{padding:14px max(16px,calc((100% - 1050px)/2))}header,.tools,.modes,form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header{background:white;border-bottom:1px solid #cbd9d6;gap:20px}header strong{color:#18565a}a{color:#176166}h1{font-size:24px;margin:8px 0}h2{font-size:17px}button,input{font:inherit;border:1px solid #8ba4a0;border-radius:4px;background:white;padding:4px 10px;color:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}button[aria-pressed=true],button[aria-current=true]{background:#235e5b;color:white}input{width:6em}.layout{display:grid;grid-template-columns:9em minmax(0,1fr);gap:18px;margin-top:18px}#rail{height:230px;overflow:auto;border-block:1px solid #cbd9d6}#window{position:relative}#window button{position:absolute;left:0;width:100%;height:36px;text-align:left;border:0;border-radius:0}article{min-width:0}#version,#status,pre,#anchor{overflow-wrap:anywhere}#version{color:#536866}#original{position:relative;width:100%;max-width:var(--page-width);line-height:0}#original img{width:100%;height:auto}.highlight{position:absolute;background:#ffc02b66;box-shadow:inset 0 0 0 1px #ad7900;pointer-events:none}pre{font:inherit;line-height:1.8;white-space:pre-wrap;margin:0}mark{background:#ffe491}#status{border-left:3px solid #94b6ac;padding-left:8px}[hidden]{display:none!important}:focus-visible{outline:3px solid #176d92;outline-offset:1px}@media(max-width:620px){.layout{grid-template-columns:minmax(0,1fr)}#rail{height:82px}}
#continuity{margin-top:12px;border-block:1px solid #cbd9d6;padding:8px 0}#continuity details{margin:4px 0}#continuity summary{cursor:pointer;color:#18565a}#continuity ul{list-style:none;margin:6px 0;padding:0;max-height:20em;overflow:auto}#continuity li{display:flex;gap:6px;margin:4px 0}#continuity li button:first-child{overflow-wrap:anywhere;text-align:left}#bookmark-title{width:min(100%,20em)}#reading-status{margin:4px 0;min-height:1.6em;color:#536866}
#annotations{border-block:1px solid #cbd9d6;margin-block:14px;padding-block:8px;overflow-wrap:anywhere}#annotation-form{display:grid;gap:8px}#annotation-body{max-width:100%;width:100%;min-height:6em;font:inherit;padding:6px;border:1px solid #8ba4a0;border-radius:4px}#annotation-items{list-style:none;padding:0;margin:0}#annotation-items li{border-top:1px solid #cbd9d6;padding:8px 0}#annotation-items p{white-space:pre-wrap;margin:4px 0}.annotation-buttons{display:flex;flex-wrap:wrap;gap:8px}
</style></head><body><header><strong>KnowledgeOS</strong><a href="/knowledgeos/library">资料库</a><a href="/knowledgeos/account">账号与登录</a></header><main>
<h1 id="title">版本阅读</h1><p id="version"></p><div class="tools"><button id="refresh">刷新</button><form id="jump"><button type="button" id="prev" aria-label="上一位置">←</button><input type="number" min="1" step="1" required id="number" aria-label="跳转位置"><button>跳转</button><button type="button" id="next" aria-label="下一位置">→</button></form><span id="count"></span></div><p id="status" role="status"></p>
<section id="continuity" aria-label="阅读导航" hidden><details id="toc-details" open><summary>目录</summary><ul id="toc"></ul></details><details id="bookmarks-details" open><summary>我的书签</summary><ul id="bookmarks"></ul><form id="bookmark-form"><input id="bookmark-title" maxlength="120" required placeholder="书签名称" aria-label="书签名称"><button id="bookmark-add">添加书签</button></form></details><p id="reading-status" role="status"></p></section>
<div class="layout"><nav id="rail" aria-label="页与文本块" hidden><div id="window"></div></nav><article><h2 id="anchor"></h2><div class="modes" id="modes" hidden><button id="paper">原页</button><button id="structured">结构文本</button><button id="cite" disabled>生成引用链接</button><button id="annotate" disabled>选区批注</button><button id="annotations-toggle" aria-controls="annotations" aria-expanded="false">本处批注</button><a id="link" hidden>打开引用</a><a id="note-link" hidden>记笔记</a><a id="recall-link" hidden>制作遮挡练习</a></div><div id="original" hidden></div><pre id="text" hidden></pre><section id="annotations" aria-label="本处批注" hidden><p id="annotation-status" role="status"></p><ul id="annotation-items"></ul><form id="annotation-form" hidden><label for="annotation-body">批注正文</label><textarea id="annotation-body" maxlength="4000" required></textarea><label id="annotation-scope">可见范围 <select id="annotation-visibility"><option value="private">仅本人</option><option value="project">当前项目</option></select></label><div class="annotation-buttons"><button id="annotation-submit">保存批注</button><button type="button" id="annotation-rebase" hidden>读取最新版本并保留草稿</button><button type="button" id="annotation-cancel">取消</button></div></form></section></article></div></main><script>
'use strict';
const $=id=>document.getElementById(id), q=new URLSearchParams(location.search), asset=q.get('asset'), version=q.get('version'), cid=q.get('citation');
const requestedUnit=q.get('unit')??'1', requestedConversion=q.get('conversion');
const requestedMatch=q.get('match');
const uuid=s=>typeof s==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s), digest=s=>typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
const integer=Number.isSafeInteger, ready=d=>d.state==='ready'||d.state==='review';
const status=s=>{$('status').textContent=s}, invalid=()=>new Error('invalid'), problem=http=>Object.assign(new Error(),{http});
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
let gen=0, owner=null, ordinal=1, total=0, conversion=null, page=null, selection=null, pending=null, posting=false, mode=null, resolved=null, versionLabel='', followCitation=!!cid, followMatch=requestedMatch!==null;
let pendingMatchSave=followMatch;
const readerPath='assets/'+asset+'/versions/'+version+'/reader';
let continuity=null, outlineLoaded=false, busy=false;
let annotationPanel=false, annotationDraft=null, annotationBusy=false, annotationSequence=0, suspendedDraft=null;
let expirationTimer=null;
const readingStatus=s=>{$('reading-status').textContent=s};
async function api(path,options){
  const r=await fetch('/knowledge/v1/'+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
  if(!r.ok){const e=problem(r.status);if(r.status===422||r.status===409)e.code=(await r.json().catch(()=>null))?.code;throw e}return (await r.json()).data;
}
async function access(g){
  if(g!==gen||document.hidden)return false;
  try{
    const sent=performance.now();
    const m=await api('assets/'+asset+'/versions/'+version+'/reader-access',{signal:AbortSignal.timeout(2000)});
    if(g!==gen||document.hidden)return false;
    if(!m||typeof m.actor_id!=='string'||!m.actor_id||m.asset_id!==asset||m.version_id!==version||!integer(m.version)||m.version<1||typeof m.is_latest!=='boolean')throw invalid();
    if(owner!==null && owner!==m.actor_id){lock('账号已切换，请刷新以重新检查资料权限。');return false}
    clearTimeout(expirationTimer);expirationTimer=null;
    if(m.read_expires_at!=null){
      const limit=sent+Date.parse(m.read_expires_at)-Date.parse(m.server_time);if(!Number.isFinite(limit))throw invalid();
      const check=()=>{if(g!==gen)return;const remaining=limit-performance.now();if(remaining<=0)lock('读取授权已到期，请重新核对权限。');else expirationTimer=setTimeout(check,Math.min(Math.ceil(remaining),2147483647))};
      check();if(g!==gen)return false;
    }
    owner=m.actor_id;versionLabel=(m.is_latest?'固定版本':'旧版本')+' v'+m.version;return true;
  }catch(e){failure(e,g);return false}
}
function clearPage(){
  page=null;selection=null;posting=false;getSelection().removeAllRanges();
  for(const id of ['text','original','anchor'])$(id).replaceChildren();
  for(const id of ['text','original','modes','link'])$(id).hidden=true;
  $('link').removeAttribute('href');$('note-link').hidden=true;$('note-link').removeAttribute('href');$('cite').disabled=true;
  $('recall-link').hidden=true;$('recall-link').removeAttribute('href');
  clearAnnotations();
}
function lock(message,keepDraft=false){
  clearTimeout(expirationTimer);expirationTimer=null;
  if(!keepDraft)suspendedDraft=null;
  ++gen;owner=null;total=0;conversion=null;resolved=null;pending=null;ordinal=1;versionLabel='';mode=null;clearPage();
  followCitation=!!cid;
  followMatch=requestedMatch!==null;
  continuity=null;outlineLoaded=false;busy=false;$('continuity').hidden=true;$('toc').replaceChildren();$('bookmarks').replaceChildren();$('bookmark-title').value='';readingStatus('');
  $('title').textContent='版本阅读';$('version').textContent='';navigation();status(message);
}
function failure(e,g){
  if(g!==gen)return;
  if(e.http===401)lock('请先登录，然后刷新阅读页。');
  else if(e.http===403||e.http===404)lock('资料不可访问，请核对账号与当前权限。');
  else if(e.http===409)lock('引用或来源已变化，与固定版本不匹配。');
  else lock('读取失败，无法确认来源或账号。请刷新重试。');
}
// Only visible ordinal buttons (plus overscan) exist. Only the displayed unit holds source bytes.
function renderWindow(){
  const rail=$('rail'), list=$('window');list.style.height=(total*36)+'px';
  const start=Math.max(1,Math.floor(rail.scrollTop/36)-2), end=Math.min(total,start+Math.ceil(rail.clientHeight/36)+5), nodes=[];
  for(let n=start;n<=end;n++){
    const b=document.createElement('button');b.type='button';b.style.top=((n-1)*36)+'px';b.textContent='位置 '+n;b.setAttribute('aria-current',String(n===ordinal));b.onclick=()=>navigate(n);nodes.push(b);
  }
  list.replaceChildren(...nodes);
}
function navigation(){
  $('prev').disabled=!total||ordinal<=1;$('next').disabled=!total||ordinal>=total;
  $('number').value=total?ordinal:'';$('number').max=String(total);for(const el of $('jump').querySelectorAll('input,button:not([type=button])'))el.disabled=!total;
  $('count').textContent=total?'第 '+ordinal+' / '+total+' 处':'';$('rail').hidden=!total;
  const rail=$('rail');renderWindow();if(total && ((ordinal-1)*36<rail.scrollTop || ordinal*36>rail.scrollTop+rail.clientHeight)){rail.scrollTop=(ordinal-1)*36;renderWindow()}
}
function locator(c,id){
  if(!c || (id && c.id!==undefined && c.id!==id) || c.asset_id!==asset || c.version_id!==version || !integer(c.ordinal)||c.ordinal<1 || !integer(c.start)||c.start<0||!integer(c.end)||c.end<=c.start||!digest(c.source_hash)||!digest(c.quote_hash)||(c.conversion_id!=null&&!uuid(c.conversion_id)))throw invalid();
  return c;
}
function validRange(s,start,end){
  const split=i=>i>0 && i<s.length && /[\uD800-\uDBFF]/.test(s[i-1]) && /[\uDC00-\uDFFF]/.test(s[i]);
  return integer(start)&&integer(end)&&start>=0&&start<end&&end<=s.length&&!split(start)&&!split(end);
}
function validate(d,n,cv){
  if(!d||d.asset_id!==asset||d.version_id!==version||d.ordinal!==n||!integer(d.total)||d.total<0||(d.total?d.total<n:n!==1)||!['text','pdf','office'].includes(d.kind)||typeof d.state!=='string'||typeof d.text!=='string')throw invalid();
  if(cv && d.conversion_id!==cv || (d.conversion_id!=null && (d.kind!=='office'||!uuid(d.conversion_id))) || (d.kind==='office' && ready(d) && !uuid(d.conversion_id)))throw invalid();
  if(d.image!=null && (typeof d.image!=='string'||!/^data:image\/png;base64,[A-Za-z\d+/]+=*$/.test(d.image)||!(d.width>0&&Number.isFinite(d.width)&&d.height>0&&Number.isFinite(d.height))))throw invalid();
  return d;
}
const usable=p=>p&&integer(p.ordinal)&&p.ordinal>0&&digest(p.source_hash)&&(p.conversion_id==null||uuid(p.conversion_id));
const point=d=>({ordinal:d.ordinal,source_hash:d.position_hash,...(d.conversion_id?{conversion_id:d.conversion_id}:{})});
async function readState(g){
  const state=await api(readerPath+'-state');
  if(g!==gen)return;
  if(state?.actor_id!==owner||!integer(state.revision)||state.revision<0||(state.position!==null&&!usable(state.position))||!Array.isArray(state.bookmarks)||state.bookmarks.some(m=>!usable(m)||!uuid(m.id)||typeof m.title!=='string'))throw invalid();
  continuity=state;
}
function emptyRow(label){const li=document.createElement('li');li.textContent=label;return li}
function control(label,click){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=click;return b}
function renderBookmarks(){
  const nodes=(continuity?.bookmarks??[]).map(m=>{
    const li=document.createElement('li'),del=control('删除',()=>changeBookmark(m));del.setAttribute('aria-label','删除书签：'+m.title);
    li.append(control(m.title,()=>navigate(m.ordinal,m)),del);return li;
  });
  $('bookmarks').replaceChildren(...(nodes.length?nodes:[emptyRow('暂无书签')]));
  $('bookmark-add').disabled=!continuity||!page||!digest(page.position_hash)||busy;
}
async function showOutline(g){
  if(outlineLoaded)return;
  try{
    const o=await api(readerPath+'-outline');
    if(g!==gen||!await access(g))return;
    if(o?.actor_id!==owner||!Array.isArray(o.items)||o.items.some(x=>!integer(x.ordinal)||x.ordinal<1||typeof x.title!=='string'))throw invalid();
    const nodes=o.items.map(x=>{
      const row=document.createElement('li');row.style.paddingInlineStart=Math.min(8,x.depth??0)*10+'px';
      const jump=control(x.title,()=>navigate(x.ordinal));jump.disabled=x.ordinal>total;
      row.append(jump);return row;
    });
    if(o.items.some(x=>x.ordinal>total))nodes.unshift(emptyRow('部分目录位置尚未解析，暂不可跳转。'));
    $('toc').replaceChildren(...(nodes.length?nodes:[emptyRow('没有可用的原始目录')]));outlineLoaded=true;
  }catch(e){if(g===gen&&await access(g))$('toc').replaceChildren(emptyRow('目录暂不可用'))}
}
function writeOptions(method,b){return {method,headers:{'Content-Type':'application/json','X-KnowledgeOS-Request':'1','X-KnowledgeOS-Reader-Actor':owner},...(b?{body:JSON.stringify(b)}:{})}}
async function writeFailure(e,g,label){
  if(g!==gen)return;
  if(e.code==='READER_ACTOR_CHANGED'||e.http===401||e.http===403||e.http===404){if(!await access(g))return}
  if(g!==gen)return;
  readingStatus(e.code==='READING_REVISION_CONFLICT'?'未保存：另一标签页已更新位置，请刷新后重试。':label);
}
async function remember(g,d,searchMatch=false){
  if(!continuity||!digest(d.position_hash))return;
  const revision=continuity.revision,p=point(d);
  const saved=continuity.position;
  if(searchMatch&&saved?.ordinal===p.ordinal&&saved.source_hash===p.source_hash&&saved.conversion_id===p.conversion_id){pendingMatchSave=false;return}
  try{
    if(!await access(g))return;
    // A write already dispatched must not be replayed automatically after a tab switch.
    if(searchMatch)pendingMatchSave=false;
    const r=await api(readerPath+'-state',writeOptions('PUT',{...p,expected_revision:revision}));
    if(!await access(g))return;
    if(r?.revision!==revision+1||!usable(r.position)||r.position.ordinal!==p.ordinal||r.position.source_hash!==p.source_hash||r.position.conversion_id!==p.conversion_id)throw invalid();
    continuity.revision=r.revision;readingStatus('阅读位置已保存。');
  }catch(e){await writeFailure(e,g,'未确认保存阅读位置。')}
}
async function changeBookmark(m){
  if(busy||!continuity||(!m&&(!page||!digest(page.position_hash))))return;
  const g=gen,title=$('bookmark-title').value.trim();if(!m&&!title)return;
  busy=true;renderBookmarks();readingStatus('');
  try{
    if(!await access(g))return;
    const r=m?await api(readerPath+'-bookmarks/'+m.id,writeOptions('DELETE')):await api(readerPath+'-bookmarks',writeOptions('POST',{...point(page),title}));
    if(!await access(g))return;
    if(m){if(r?.id!==m.id)throw invalid();continuity.bookmarks=continuity.bookmarks.filter(x=>x.id!==m.id)}
    else{if(!usable(r)||!uuid(r.id)||r.title!==title)throw invalid();continuity.bookmarks.push(r);$('bookmark-title').value=''}
    readingStatus(m?'书签已删除。':'书签已添加。');
  }catch(e){await writeFailure(e,g,m?'未确认删除书签。':'未确认添加书签。')}
  finally{if(g===gen){busy=false;renderBookmarks()}}
}
async function load(n,{openCitation=false,openMatch=false,restore=false,save=false,bookmark=null}={}){
  if(document.hidden)return;
  const g=++gen;clearPage();resolved=null;followCitation=!!cid&&openCitation;followMatch=openMatch;ordinal=n;navigation();status('正在读取…');
  try{
    if(!uuid(asset)||!uuid(version)||(cid!==null&&!uuid(cid))||!/^\d{1,9}$/.test(requestedUnit)||Number(requestedUnit)<1||(requestedConversion!==null&&!uuid(requestedConversion)))throw invalid();
    const needle=openMatch&&requestedMatch?.match(/^(\d{1,9}):(\d{1,9}):([a-f0-9]{64})$/);
    if(openMatch&&(!needle||cid||!q.has('unit')||n!==Number(requestedUnit)))throw invalid();
    if(!await access(g))return;
    if(!continuity){try{await readState(g)}catch{if(!await access(g))return;readingStatus('个人阅读状态暂不可用。')}}
    const c=openCitation && cid?locator(await api('citations/'+cid+'/resolve'),cid):null;
    if(g!==gen)return;
    if(c && ((q.has('unit')&&Number(requestedUnit)!==c.ordinal)||(requestedConversion && requestedConversion!==c.conversion_id)))throw problem(409);
    const saved=restore?continuity?.position:null;
    let at=c?.ordinal??saved?.ordinal??n, cv=c?.conversion_id??bookmark?.conversion_id??conversion??requestedConversion;
    const get=async()=>validate(await api(readerPath+'?unit='+at+(cv?'&conversion='+cv:'')),at,cv);
    let d;
    try{d=await get()}catch(e){if(!saved||e.http!==422)throw e}
    if(saved&&(!d||d.position_hash!==saved.source_hash||d.conversion_id!==saved.conversion_id)){at=1;cv=null;d=await get()}
    if(bookmark&&d.position_hash!==bookmark.source_hash)throw problem(409);
    if(g!==gen)return;
    if(!digest(d.anchor)||await sha(d.text)!==d.anchor)throw problem(409);
    if(c && (c.conversion_id??null)!==(d.conversion_id??null))throw invalid();
    if(c && ready(d) && (!validRange(d.text,c.start,c.end)||await sha(d.text)!==c.source_hash||await sha(d.text.slice(c.start,c.end))!==c.quote_hash))throw problem(409);
    if(needle&&(!ready(d)||d.anchor!==needle[3]||!validRange(d.text,Number(needle[1]),Number(needle[2]))))throw problem(409);
    if(!await access(g))return;
    resolved=c;ordinal=at;total=d.total;conversion=d.conversion_id??null;page=d;navigation();
    $('version').textContent=versionLabel+' · '+version;$('title').textContent=d.title||'版本阅读';$('anchor').textContent=d.chapter||((d.kind==='text'?'文本块 ':'第 ')+at+(d.kind==='text'?'':' 页'));
    if(c && ready(d))selection={start:c.start,end:c.end};
    if(needle){selection={start:Number(needle[1]),end:Number(needle[2])};mode='text'}
    draw();if(c||needle)document.querySelector('#original .highlight,#text mark')?.scrollIntoView({block:'nearest'});
    $('continuity').hidden=false;renderBookmarks();
    if(save||needle&&pendingMatchSave){busy=true;await remember(g,d,Boolean(needle))}
    void showOutline(g);
  }catch(e){
    if(g!==gen)return;
    if(total && (e.http===503||e.http===502||e.http===500)){
      try{if(await access(g))status('本处加载失败，请刷新重试或选择其他位置。')}catch(err){failure(err,g)}
    }else failure(e,g);
  }finally{if(g===gen){busy=false;renderBookmarks()}}
}
function navigate(n,bookmark=null){if(busy||!integer(n)||n<1||(!bookmark&&n>total))return;readingStatus('');void load(n,{save:!bookmark,bookmark})}
// A partial glyph/run has no known pixel boundary. Never interpolate a rectangle.
function exactBoxes(d,s){
  if(resolved && s?.start===resolved.start && s?.end===resolved.end && resolved.locator?.geometry){
    const g=resolved.locator.geometry;
    if(g.page!==d.ordinal||g.width!==d.width||g.height!==d.height||!digest(g.source_sha256)||g.source_sha256!==d.original_sha256)return [];
    d={...d,boxes:g.boxes};
  }
  if(!s||!Array.isArray(d.boxes))return [];
  const boxes=d.boxes.filter(b=>b && b.end>s.start && b.start<s.end).sort((a,b)=>a.start-b.start);
  let at=s.start;
  for(const b of boxes){
    if(!validRange(d.text,b.start,b.end)||b.start<at||b.end>s.end||d.text.slice(at,b.start).trim()||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>d.width||b.y+b.height>d.height)return [];
    at=b.end;
  }
  return d.text.slice(at,s.end).trim()?[]:boxes;
}
function draw(){
  const d=page;if(!d)return;
  const showOriginal=!!d.image && mode!=='text', surface=$('original'), text=$('text');
  const available=ready(d), s=available?selection:null, boxes=exactBoxes(d,s);
  $('modes').hidden=!d.image&&!available;$('paper').disabled=!d.image;$('structured').disabled=!available;
  $('paper').setAttribute('aria-pressed',String(showOriginal));$('structured').setAttribute('aria-pressed',String(!showOriginal&&available));
  surface.hidden=!showOriginal;text.hidden=showOriginal||!available;surface.replaceChildren();text.replaceChildren();
  if(showOriginal){
    const img=document.createElement('img');img.alt='第 '+ordinal+' 页原页';img.onerror=()=>{if(page===d && surface.contains(img))status('原页图像加载失败，请刷新重试。')};img.src=d.image;
    surface.style.setProperty('--page-width',d.width+'px');surface.append(img);
    for(const b of boxes){const h=document.createElement('span');h.className='highlight';Object.assign(h.style,{left:100*b.x/d.width+'%',top:100*b.y/d.height+'%',width:100*b.width/d.width+'%',height:100*b.height/d.height+'%'});surface.append(h)}
  }else if(available){
    if(s){const mark=document.createElement('mark');mark.textContent=d.text.slice(s.start,s.end);text.append(d.text.slice(0,s.start),mark,d.text.slice(s.end))}else text.textContent=d.text;
  }
  $('cite').disabled=!available||!s||posting;
  if(available){$('recall-link').href='/knowledgeos/recall?'+new URLSearchParams({asset,version,unit:String(d.ordinal),...(d.conversion_id?{conversion:d.conversion_id}:{})});$('recall-link').hidden=false}
  $('annotate').disabled=!available||!s||posting||annotationBusy;$('annotations-toggle').disabled=!available;
  const states={failed:'本处解析失败。',empty:'此版本没有可阅读的文本块。',unconverted:'此版本尚无已完成的转换。',review:'本页解析结果待复核。'};
  const layout=d.kind==='pdf'&&available&&!showOriginal?' 提取文本不等同于原页版式。':'';
  status((states[d.state] || (!available?'本处尚未就绪。':showOriginal&&s&&!boxes.length?'原页缺少精确选区坐标，请查看结构文本中的高亮。':resolved?'已定位到固定版本引用。':'已打开固定版本。'))+layout);
}
function capture(){
  if(!page||!ready(page)||posting||$('text').hidden)return;
  const sel=getSelection();if(!sel.rangeCount||sel.isCollapsed)return;
  const r=sel.getRangeAt(0),text=$('text');if(!text.contains(r.startContainer)||!text.contains(r.endContainer)){selection=null;pending=null;$('cite').disabled=true;$('annotate').disabled=true;return}
  // Measure from the container, not indexOf(quote): repeated passages and split mark nodes are legal.
  const prefix=r.cloneRange();prefix.selectNodeContents(text);prefix.setEnd(r.startContainer,r.startOffset);
  const start=prefix.toString().length,end=start+r.toString().length;
  if(selection?.start!==start||selection?.end!==end){for(const id of ['link','note-link']){$(id).hidden=true;$(id).removeAttribute('href')}}
  selection=validRange(page.text,start,end)?{start,end}:null;$('cite').disabled=!selection;$('annotate').disabled=!selection||annotationBusy;
}
async function createCitation(range=selection,announce=true){
  if(!page||!range||posting)return;
  const g=gen, d=page, {start,end}=range;posting=true;$('cite').disabled=true;
  try{
    const source_hash=await sha(d.text),quote=await sha(d.text.slice(start,end));if(g!==gen)return;
    const body={asset_id:asset,version_id:version,ordinal:d.ordinal,start,end,source_hash,...(d.conversion_id?{conversion_id:d.conversion_id}:{})};
    const signature=JSON.stringify([owner,body]);
    const key=pending?.signature===signature?pending.key:crypto.randomUUID();pending={signature,key};
    if(!await access(g))return;
    const receipt=await api('citations',{method:'POST',headers:{'Content-Type':'application/json','X-KnowledgeOS-Request':'1','Idempotency-Key':key},body:JSON.stringify(body)});
    if(!await access(g))return;
    const c=locator(receipt);if(!uuid(c.id)||c.ordinal!==body.ordinal||c.start!==start||c.end!==end||c.source_hash!==source_hash||c.quote_hash!==quote||(c.conversion_id??null)!==(body.conversion_id??null))throw invalid();
    if(announce){const u=new URL('/knowledgeos/reader',location.origin);u.search=new URLSearchParams({asset,version,citation:c.id});
      $('link').href=u.href;$('link').hidden=false;
      $('note-link').href='/knowledgeos/notes?'+new URLSearchParams({citation:c.id});$('note-link').hidden=false;draw();status('引用链接已生成。')}
    return c;
  }catch(e){
    if(g!==gen)return;if([401,403,404,409].includes(e.http)){failure(e,g);return}
    if(e.code==='WORD_STRUCTURE_UNVERIFIED'){status('选区无法可靠定位到 Word 源段落，未生成引用。');return}
    // A lost response is not proof of a failed write. Preserve the request key for this exact range.
    status('未收到有效回执，可以重试本次引用。');
  }finally{if(g===gen){posting=false;$('cite').disabled=!selection}}
}
const annotationMessage=s=>{$('annotation-status').textContent=s};
function resetAnnotationDraft(){annotationDraft=null;$('annotation-form').hidden=true;$('annotation-body').value='';$('annotation-visibility').value='private';$('annotation-rebase').hidden=true;$('annotation-submit').disabled=false}
function clearAnnotations(){
  annotationSequence++;annotationBusy=false;annotationPanel=false;resetAnnotationDraft();$('annotations').hidden=true;$('annotations-toggle').setAttribute('aria-expanded','false');$('annotation-items').replaceChildren();annotationMessage('');
}
const annotationUrl=(d,id)=>readerPath+'-annotations'+(id?'/'+id:'')+'?unit='+d.ordinal+(d.conversion_id?'&conversion='+d.conversion_id:'');
async function refreshAnnotations(g){
  const d=page,seq=++annotationSequence;if(!annotationPanel||!d)return;
  try{
    const data=await api(annotationUrl(d),{signal:AbortSignal.timeout(3000)});
    if(g!==gen||seq!==annotationSequence||!await access(g)||seq!==annotationSequence)return;
    if(data?.actor_id!==owner||typeof data.can_comment!=='boolean'||typeof data.can_share!=='boolean'||!Array.isArray(data.items))throw invalid();
    if(annotationDraft&&(!data.can_comment||(annotationDraft.id&&!data.items.some(x=>x.id===annotationDraft.id&&x.can_edit))))resetAnnotationDraft();
    $('annotation-visibility').options[1].disabled=!data.can_share;if(!data.can_share)$('annotation-visibility').value='private';
    const items=data.items.filter(x=>uuid(x.id)&&uuid(x.citation_id)&&x.ordinal===d.ordinal&&(x.conversion_id??null)===(d.conversion_id??null)&&x.source_hash===d.anchor&&validRange(d.text,x.start,x.end)&&typeof x.body==='string'&&integer(x.revision)&&['private','project'].includes(x.visibility));
    $('annotation-items').replaceChildren(...(items.length?items.map(renderAnnotation):[emptyRow('本处暂无批注')]));
    return {...data,items};
  }catch(e){
    if(g!==gen||seq!==annotationSequence)return;
    if(e.http===401||e.http===403||e.http===404){if(!await access(g))return}
    if(g===gen&&seq===annotationSequence){clearAnnotations();$('annotations').hidden=false;annotationMessage('无法读取本处批注。')}
  }
}
function renderAnnotation(m){
  const row=document.createElement('li'),body=document.createElement('p'),bar=document.createElement('div');bar.className='annotation-buttons';
  body.textContent=m.body;row.dataset.annotationId=m.id;
  bar.append(m.visibility==='private'?'仅本人':'当前项目',control('定位',()=>{
    if(!page||!validRange(page.text,m.start,m.end))return;
    const g=gen;void (async()=>{if(await access(g)){selection={start:m.start,end:m.end};resolved=null;draw();document.querySelector('#original .highlight,#text mark')?.scrollIntoView({block:'nearest'})}})();
  }));
  if(m.can_edit)bar.append(control('编辑',()=>{
    if(annotationBusy)return;resetAnnotationDraft();annotationDraft={id:m.id,revision:m.revision};$('annotation-scope').hidden=true;$('annotation-form').hidden=false;$('annotation-body').value=m.body;$('annotation-body').focus();annotationMessage('');
  }),control('删除',()=>{if(!annotationBusy&&confirm('删除这条批注？'))void writeAnnotation('DELETE',m)}));
  row.append(body,bar);return row;
}
async function openAnnotations(range){
  if(!page||annotationBusy)return;
  const g=gen;annotationPanel=true;$('annotations').hidden=false;$('annotations-toggle').setAttribute('aria-expanded','true');
  const data=await refreshAnnotations(g);if(!range||!data||g!==gen)return;
  if(!data.can_comment){annotationMessage('当前权限不可添加批注。');return}
  resetAnnotationDraft();annotationDraft={range};$('annotation-scope').hidden=false;$('annotation-form').hidden=false;$('annotation-body').focus();annotationMessage('');
}
async function writeAnnotation(method,draft){
  if(annotationBusy||!page||!draft)return;
  const g=gen,d=page,body=$('annotation-body').value;
  if(method!=='DELETE'&&!body.trim())return;
  annotationBusy=true;$('annotation-submit').disabled=true;annotationMessage('');
  try{
    if(!await access(g))return;
    let request;
    if(method==='POST'){
      const c=await createCitation(draft.range,false);if(!c||g!==gen){if(g===gen)annotationMessage('未确认批注选区，草稿未保存。');return}
      request={body,citation_id:c.id,visibility:$('annotation-visibility').value};
    }else request={expected_revision:draft.revision,...(method==='PATCH'?{body}:{})};
    const r=await api(annotationUrl(d,draft.id),writeOptions(method,request));
    if(!await access(g))return;
    if(!uuid(r?.id)||(draft.id&&r.id!==draft.id)||method!=='DELETE'&&r.body!==body)throw invalid();
    resetAnnotationDraft();await refreshAnnotations(g);if(g===gen&&annotationPanel)annotationMessage(method==='DELETE'?'批注已删除。':'批注已保存。');
  }catch(e){
    if(g!==gen)return;
    if(e.http===401||e.http===403||e.http===404||e.code==='READER_ACTOR_CHANGED'){if(!await access(g))return;await refreshAnnotations(g)}
    if(g!==gen)return;
    if(e.code==='ANNOTATION_REVISION_CONFLICT'){
      if(method==='PATCH'&&annotationDraft===draft){draft.conflict=true;$('annotation-rebase').hidden=false}
      else await refreshAnnotations(g);
      if(g===gen)annotationMessage(method==='PATCH'?'批注已被其他标签页修改，草稿已保留。':'批注已变化，请核对后重试。');
    }else annotationMessage('未确认批注保存或删除。');
  }finally{if(g===gen){annotationBusy=false;$('annotation-submit').disabled=Boolean(annotationDraft?.conflict)}}
}
let modeSequence=0,polling=false,resumeAt=null;
async function switchMode(target){
  const g=gen,seq=++modeSequence;
  if(page&&await access(g)&&seq===modeSequence){mode=target;draw()}
}
async function recheck(){
  if(!owner||document.hidden||polling)return;
  const g=gen;polling=true;
  try{if(await access(g)&&page)$('version').textContent=versionLabel+' · '+version}finally{polling=false}
}
$('paper').onclick=()=>switchMode('paper');$('structured').onclick=()=>switchMode('text');
$('cite').onpointerdown=e=>e.preventDefault();$('cite').onclick=()=>createCitation();document.addEventListener('selectionchange',capture);
$('annotate').onpointerdown=e=>e.preventDefault();$('annotate').onclick=()=>{if(selection)void openAnnotations({...selection})};
$('annotations-toggle').onclick=()=>{if(annotationPanel){if(!annotationBusy)clearAnnotations()}else void openAnnotations(null)};
$('annotation-form').onsubmit=e=>{e.preventDefault();if(annotationDraft&&!annotationDraft.conflict)void writeAnnotation(annotationDraft.id?'PATCH':'POST',annotationDraft)};
$('annotation-cancel').onclick=()=>{if(!annotationBusy)resetAnnotationDraft()};
$('annotation-rebase').onclick=async()=>{
  const g=gen,draft=annotationDraft;if(!draft?.id||annotationBusy)return;
  const data=await refreshAnnotations(g),m=data?.items.find(x=>x.id===draft.id&&x.can_edit);
  if(g===gen&&draft===annotationDraft&&m){draft.revision=m.revision;draft.conflict=false;$('annotation-submit').disabled=false;$('annotation-rebase').hidden=true;annotationMessage('已读取当前批注，草稿未提交。')}
};
$('bookmark-form').onsubmit=e=>{e.preventDefault();void changeBookmark(null)};
$('jump').onsubmit=e=>{e.preventDefault();navigate(Number($('number').value))};$('prev').onclick=()=>navigate(ordinal-1);$('next').onclick=()=>navigate(ordinal+1);
$('rail').onscroll=renderWindow;new ResizeObserver(renderWindow).observe($('rail'));
function refresh(){if(busy)return;continuity=null;outlineLoaded=false;readingStatus('');void load(total?ordinal:Number(requestedUnit),{openCitation:followCitation,openMatch:followMatch,restore:!total&&!cid&&!q.has('unit')&&!requestedConversion})}
$('refresh').onclick=refresh;
// Clear the DOM on hide. Only a same-document tab switch can retain an in-memory draft.
function suspend(keepDraft=false){
  // An in-flight PATCH can be rechecked by ID/revision. Never replay a hidden POST.
  if(keepDraft&&annotationDraft&&(!annotationBusy||annotationDraft.id)&&owner&&page){
    suspendedDraft={actor:owner,ordinal:page.ordinal,conversion,anchor:page.anchor,draft:annotationDraft,
      body:$('annotation-body').value,visibility:$('annotation-visibility').value,checkingSave:annotationBusy};
  }
  resumeAt??={n:total||suspendedDraft?ordinal:Number(requestedUnit),cv:conversion,cite:followCitation,match:followMatch};
  lock('返回后将重新检查阅读权限。',keepDraft);
}
async function resume(){
  if(document.hidden||!resumeAt)return;
  const prior=resumeAt,saved=suspendedDraft,g=gen+1;resumeAt=null;conversion=prior.cv;
  await load(prior.n,{openCitation:prior.cite,openMatch:prior.match});
  if(g!==gen||!saved||suspendedDraft!==saved)return;
  const discard=()=>{if(suspendedDraft===saved)suspendedDraft=null};
  if(!page||owner!==saved.actor||page.ordinal!==saved.ordinal||conversion!==saved.conversion||page.anchor!==saved.anchor||annotationPanel){discard();return}
  annotationPanel=true;$('annotations').hidden=false;$('annotations-toggle').setAttribute('aria-expanded','true');
  const data=await refreshAnnotations(g);
  if(g!==gen||suspendedDraft!==saved)return;
  discard();
  if(!data?.can_comment||annotationDraft||!annotationPanel)return;
  const draft=saved.draft;
  if(draft.id){
    const current=data.items.find(x=>x.id===draft.id&&x.can_edit);if(!current)return;
    if(saved.checkingSave&&current.revision!==draft.revision){
      if(current.body===saved.body){annotationMessage('当前批注已包含提交内容。');return}
      draft.conflict=true;
    }
  }else if(!validRange(page.text,draft.range.start,draft.range.end)||saved.visibility==='project'&&!data.can_share)return;
  annotationDraft=draft;$('annotation-body').value=saved.body;$('annotation-visibility').value=saved.visibility;
  $('annotation-scope').hidden=Boolean(draft.id);$('annotation-form').hidden=false;
  $('annotation-rebase').hidden=!draft.conflict;$('annotation-submit').disabled=Boolean(draft.conflict);
  annotationMessage(draft.conflict?'批注已被其他标签页修改，草稿已保留。':'已恢复本标签页的未提交草稿。');
}
window.addEventListener('pagehide',()=>suspend());
window.addEventListener('pageshow',e=>{if(e.persisted)resume()});
window.addEventListener('focus',recheck);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend(true);else if(resumeAt)resume();else refresh()});
setInterval(recheck,2000);
void load(Number(requestedUnit),{openCitation:true,openMatch:followMatch,restore:!cid&&!q.has('unit')&&!requestedConversion});
</script></body></html>`;
}

// src/host/note-page.ts
function buildNotesHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>笔记 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8faf9;color:#223638;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}
header{background:#fff;border-bottom:1px solid #cedbd7}nav,main{max-width:1120px;margin:auto;padding:0 22px}nav,.tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap}nav{min-height:54px;padding-block:8px}nav strong{color:#18565a;font-size:18px;margin-right:8px}
main{padding-block:22px}h1,h2,p{margin:0}h1{font-size:25px}h2{font-size:17px}a{color:#176166;text-underline-offset:3px}button,input,select,textarea{font:inherit;color:inherit}button,input,select,textarea{border:1px solid #8a9d99;border-radius:5px;background:#fff;padding:6px 9px}button{cursor:pointer;color:#215c5c}button:disabled{opacity:.58;cursor:default}button[type=submit]{background:#226461;color:#fff}button[aria-current=true]{background:#e1efea;border-color:#558b83}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid #176d92;outline-offset:2px}
.workspace{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,3fr);gap:22px;margin-top:18px}.sidebar{border-right:1px solid #cfdad7;padding-right:16px;min-width:0}ul{padding:0;margin:8px 0;list-style:none}li{border-bottom:1px solid #dce6e3;padding:7px 0;overflow-wrap:anywhere}#list button{text-align:left;width:100%;border-color:transparent;overflow-wrap:anywhere}#list button[aria-current=true]{border-color:#558b83}
label{display:grid;gap:4px;font-weight:600;min-width:0}input,select,textarea{width:100%;min-width:0}textarea{resize:vertical;min-height:16em}form,.stack{display:grid;gap:12px}fieldset{border:0;margin:0;padding:0;min-width:0}fieldset[disabled]{opacity:.7}section{border-top:1px solid #cfdad7;padding-top:14px}#status{min-height:1.6em;margin:6px 0;color:#526663}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;max-height:12em;overflow:auto}#conflict{border-left:3px solid #ad7542;padding-left:9px}#references li{display:flex;gap:10px;align-items:center;flex-wrap:wrap}small{color:#536866}#project-list{margin-bottom:0}[hidden]{display:none!important}
#outline-list{max-height:21em;overflow:auto}#outline-list li{padding:2px 0;border:0}#outline-list ol{list-style:none;margin:0;padding:0}#outline-list button{text-align:left;max-width:100%;overflow-wrap:anywhere}#node-body{min-height:5em}#node-conflict,#node-delete-review{border-inline-start:3px solid #ad7542;padding-inline-start:10px}#node-target{width:min(100%,26em)}
@media(max-width:670px){nav,main{padding-inline:14px}.workspace{grid-template-columns:1fr;gap:14px}.sidebar{border-right:0;border-bottom:1px solid #cfdad7;padding:0 0 12px}textarea{min-height:10em}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/notes" aria-current="page">笔记</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>笔记</h1><p id="status" role="status">正在读取…</p><div id="workspace" class="workspace" hidden>
<aside class="sidebar" aria-label="我的笔记"><button type="button" id="new">新建笔记</button><ul id="list"></ul><button type="button" id="more" hidden>更多笔记</button></aside>
<div class="stack"><form id="editor"><fieldset id="fields" class="stack"><label>标题<input id="title" maxlength="200" required></label>
<label>类型<select id="kind"><option value="plain">普通笔记</option><option value="reading">读书笔记</option><option value="project">项目随记</option><option value="reflection">个人复盘</option></select></label>
<label>正文<textarea id="body" maxlength="32000"></textarea></label><div class="tools"><button type="submit" id="save">保存笔记</button><small id="revision"></small></div></fieldset></form>
<section id="conflict" hidden><h2>服务器版本</h2><p id="latest-title"></p><pre id="latest-body"></pre><button type="button" id="rebase">保留草稿并使用此修订</button></section>
<section id="outline" class="stack" hidden aria-labelledby="outline-heading"><h2 id="outline-heading">层级大纲</h2>
<ul id="outline-list" aria-label="大纲节点"></ul>
<fieldset id="node-controls" class="stack"><label id="node-label">节点正文<textarea id="node-body" maxlength="32000"></textarea></label>
<div class="tools"><button id="node-add" type="button">添加子节点</button><button id="node-save" type="button">保存节点</button>
<button id="node-indent" type="button" aria-label="缩进" title="缩进">⇥</button><button id="node-promote" type="button" aria-label="提升" title="提升">⇤</button>
<button id="node-up" type="button" aria-label="上移" title="上移">↑</button><button id="node-down" type="button" aria-label="下移" title="下移">↓</button>
<button id="node-undo" type="button" aria-label="撤销结构改动" title="撤销结构改动">↶</button><button id="node-preview" type="button">删除预览</button></div>
<label>移动到<select id="node-target"></select></label><div class="tools"><button id="node-move" type="button">移动到目标末尾</button></div></fieldset>
<div id="node-delete-review" class="stack" hidden><h2>删除影响</h2><p id="node-delete-summary"></p><ul id="node-impact"></ul><div class="tools">
<button id="node-delete-subtree" type="button">连同子树回收</button><button id="node-delete-promote" type="button">回收当前节点，提升子节点</button><button id="node-delete-cancel" type="button">取消</button></div></div>
<div id="node-conflict" class="stack" hidden><h2>大纲修订冲突</h2><p id="node-conflict-revision"></p><pre id="node-latest"></pre><button id="node-refresh" type="button">读取最新大纲并保留草稿</button></div></section>
<section><h2>资料引用</h2><ul id="references"></ul></section>
<section id="project-section" hidden><h2>项目引用</h2><label>我的项目<select id="projects"><option value="">选择项目</option></select></label><div class="tools">
<button type="button" id="link-project" disabled>关联当前笔记</button><button type="button" id="more-projects" hidden>更多项目</button></div><ul id="project-list"></ul><button type="button" id="more-links" hidden>更多关联</button></section></div></div></main>
<script>
const $=id=>document.getElementById(id), path='/knowledge/v1/notes', q=new URL(location.href).searchParams;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s);
let owner, note, rows=[], next=null, pending=null, key=null, conflict=null, projectsNext=null, linksNext=null;
let busy=false, locked=false, checking=false;
let selected=null,preview=null,outlineConflict=null;
const status=text=>$('status').textContent=text;
const form=()=>({title:$('title').value,kind:$('kind').value,body:$('body').value});
const desired=q.get('note'), citation=q.get('citation');
function stop(message){
  locked=true;$('workspace').hidden=true;note=null;rows=[];pending=null;conflict=null;
  $('title').value=$('body').value=$('latest-title').textContent=$('latest-body').textContent='';
  selected=null;clearOutlinePanels();$('node-body').value='';$('node-target').replaceChildren();$('outline-list').replaceChildren();$('outline').hidden=true;
  for(const id of ['list','references','projects','project-list'])$(id).replaceChildren();status(message);
}
function error(code){const e=new Error(code);e.code=code;return e}
async function request(url,method='GET',body,extra={}){
  const r=await fetch(url,{method,cache:'no-store',redirect:'error',credentials:'same-origin',
    ...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json','x-knowledgeos-request':'1',...extra}}:{})});
  if(r.status===401||r.status===403){stop('会话不可用，请重新登录并刷新。');throw error('AUTH_REQUIRED')}
  const result=await r.json();if(!r.ok){if(result.code==='ACTOR_CHANGED')stop('账号已切换，请刷新笔记。');throw error(result.code)}
  if(url.startsWith(path)){
    if(result.data?.actor_id!==owner){stop('账号已切换，请刷新笔记。');throw error('ACTOR_CHANGED')}
    // The shared session cookie can change after this response was generated.
    await checkAccount();
  }
  if(locked)throw error('AUTH_REQUIRED');return result.data;
}
async function checkAccount(){const current=await request('/knowledge/v1/me');if(!uuid(current?.id)||owner&&owner!==current.id){stop('账号已切换，请刷新笔记。');throw error('ACTOR_CHANGED')}owner=current.id}
function enabled(){
  $('fields').disabled=busy||locked;$('new').disabled=busy;$('more').disabled=busy;
  $('save').disabled=!!(conflict||outlineConflict);$('rebase').disabled=busy;$('projects').disabled=busy;
  $('link-project').disabled=busy||!note||!$('projects').value;$('more-projects').disabled=busy;$('more-links').disabled=busy;
  for(const el of document.querySelectorAll('#list button,#references button,#project-list button'))el.disabled=busy;
  const n=currentNode(),movable=!!n?.parent_id,peers=movable?children(n.parent_id):[],index=peers.findIndex(x=>x.id===selected);
  const blocked=busy||checking||locked||!!conflict||!!outlineConflict;
  $('node-controls').disabled=blocked||!!preview;
  $('node-add').disabled=!n;$('node-save').disabled=!movable||!nodeDirty();$('node-preview').disabled=!movable;
  $('node-indent').disabled=index<=0;$('node-promote').disabled=!movable||!nodeById(n.parent_id)?.parent_id;
  $('node-up').disabled=index<=0;$('node-down').disabled=index<0||index>=peers.length-1;
  $('node-move').disabled=!movable||!$('node-target').value;$('node-undo').disabled=!note?.outline?.can_undo;
  for(const el of document.querySelectorAll('#outline-list button,#node-delete-review button'))el.disabled=blocked;
  $('node-refresh').disabled=busy||checking||locked;
}
async function action(work){
  if(busy||locked||checking)return;busy=true;enabled();
  try{await checkAccount();await work()}catch(e){
    if(!locked)status(({SOURCE_NOT_FOUND:'引用来源不可用，草稿仍保留。',PROJECT_NOT_FOUND:'项目不可用。',NOTE_NOT_FOUND:'笔记或关联不可用。',INVALID_NOTE:'无法保存，请检查标题和内容。',INVALID_OUTLINE_TARGET:'大纲位置不可用，未修改节点。',OUTLINE_LIMIT:'已达到大纲节点上限，草稿仍保留。',OUTLINE_PREVIEW_REQUIRED:'删除预览失效，请重新预览。',OUTLINE_UNDO_UNAVAILABLE:'没有可撤销的结构改动。'})[e.code]||'没有确认操作结果，可以刷新核对；草稿仍保留。');
  }finally{busy=false;enabled()}
}
function item(text,onClick){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=onClick;li.append(button);return li}
function renderList(){
  $('list').replaceChildren(...rows.map(r=>{
    const li=item(r.title,()=>action(()=>open(r.id)));li.firstChild.setAttribute('aria-current',String(note?.id===r.id));return li;
  }));$('more').hidden=!next;enabled();
}
function renderRefs(){
  $('references').replaceChildren();
  if(pending){const li=document.createElement('li');li.textContent='待保存的固定版本引用';$('references').append(li)}
  (note?.references||[]).forEach((r,i)=>{
    const li=item('移除引用',()=>action(()=>saveChanges({remove_reference:r.id},true)));
    const label=document.createElement(r.status==='linked'?'a':'span');label.textContent=r.status==='linked'?'原文引用 '+(i+1):'来源不可用';
    if(r.status==='linked'){label.href='/knowledgeos/reader?'+new URLSearchParams({asset:r.asset_id,version:r.version_id,citation:r.citation_id});label.target='_blank';label.rel='noopener noreferrer'}
    li.prepend(label);$('references').append(li);
  });
  if(!$('references').children.length){const li=document.createElement('li');li.textContent='暂无引用';$('references').append(li)}
}
function clearConflict(){conflict=null;$('conflict').hidden=true;$('latest-title').textContent=$('latest-body').textContent=''}
function showConflict(latest){conflict=latest.revision;$('latest-title').textContent=latest.title;$('latest-body').textContent=latest.body;$('conflict').hidden=false}
function apply(n,newCitation=null,outlineDraft=null){
  note=n;pending=newCitation;key=null;clearConflict();$('title').value=n?.title??'';$('kind').value=n?.kind??(newCitation?'reading':'plain');$('body').value=n?.body??'';
  $('revision').textContent=n?'修订 '+n.revision:'未保存';renderList();renderRefs();
  clearOutlinePanels();chooseNode(outlineDraft?.id,outlineDraft?.body);
}
function dirty(){const d=form();return note?(d.title!==note.title||d.kind!==note.kind||d.body!==note.body):(d.title!==''||d.body!=='')}
function edits(d){return Object.fromEntries(Object.entries(d).filter(([key,value])=>value!==note[key]))}
async function open(id){if((dirty()||nodeDirty())&&!confirm('离开未保存的草稿？'))return;const n=await request(path+'/'+id);apply(n);history.replaceState(null,'','?note='+id);status('已打开笔记。')}
async function saveChanges(extra={},preserveDraft=false){
  if(conflict||outlineConflict)return;
  const data={actor_id:owner,...(preserveDraft?{}:form()),...extra},draft=form();if(!note&&pending)data.add_citation=pending;
  try{
    let result;
    if(note){data.expected_revision=note.revision;result=await request(path+'/'+note.id,'PATCH',data)}
    else{const digest=JSON.stringify(data);if(key?.digest!==digest)key={digest,id:crypto.randomUUID()};result=await request(path,'POST',data,{'idempotency-key':key.id})}
    rows=[result,...rows.filter(r=>r.id!==result.id)];apply(result,null,keepNodeDraft());
    if(preserveDraft){$('title').value=draft.title;$('body').value=draft.body;$('kind').value=draft.kind}
    history.replaceState(null,'','?note='+result.id);status('笔记已保存。');
  }catch(e){
    if(e.code!=='REVISION_CONFLICT'||!note)throw e;
    status('笔记已在另一处更新，草稿未覆盖服务器版本。');
    showConflict(await request(path+'/'+note.id));
  }
}
const nodeById=(id,n=note)=>n?.outline?.nodes.find(x=>x.id===id);
const currentNode=()=>nodeById(selected);
const children=id=>(note?.outline?.nodes??[]).filter(n=>n.parent_id===id).sort((a,b)=>a.order_key-b.order_key);
const nodeBase=n=>n?.parent_id?n.body:'';
const nodeDirty=()=>$('node-body').value!==nodeBase(currentNode());
const keepNodeDraft=()=>({id:selected,body:nodeDirty()?$('node-body').value:undefined});
const nodeName=n=>n.parent_id===null?'正文（根节点）':(n.body.trim().slice(0,100)||'空白节点');
function clearPreview(){preview=null;$('node-delete-review').hidden=true;$('node-delete-summary').textContent='';$('node-impact').replaceChildren()}
function clearOutlinePanels(){clearPreview();outlineConflict=null;$('node-conflict').hidden=true;$('node-conflict-revision').textContent=$('node-latest').textContent=''}
function chooseNode(id,draft){
  selected=nodeById(id)?.id??children(null)[0]?.id??null;
  $('node-body').value=draft??nodeBase(currentNode());
  renderOutline();
}
function renderOutline(){
  const list=$('outline-list'),target=$('node-target'),root=children(null)[0],n=currentNode();
  list.replaceChildren();target.replaceChildren(new Option('选择目标节点',''));$('outline').hidden=!root;
  if(!root)return;
  $('node-body').ariaLabel=n?.parent_id?'节点正文':'新子节点正文';
  const visit=(row,depth,host,excluded)=>{
    const li=document.createElement('li'),button=document.createElement('button');
    li.dataset.depth=depth;li.dataset.parentId=row.parent_id??'';li.style.paddingInlineStart=depth>0&&depth<=5?'14px':'0';
    button.type='button';button.dataset.nodeId=row.id;button.textContent=nodeName(row);button.setAttribute('aria-current',String(row.id===selected));
    button.onclick=()=>action(()=>{
      if(row.id===selected)return;
      if(nodeDirty()&&!confirm('离开未保存的节点草稿？'))return;
      clearPreview();chooseNode(row.id);$('outline-list').querySelector('[aria-current="true"]')?.focus();
    });
    li.append(button);host.append(li);
    excluded||=row.id===selected;
    if(!excluded)target.add(new Option('　'.repeat(Math.min(depth,5))+nodeName(row),row.id));
    const nested=children(row.id);
    if(nested.length){const sub=document.createElement('ol');host.append(sub);for(const child of nested)visit(child,depth+1,sub,excluded)}
  };
  visit(root,0,list,false);
}
function adoptOutline(latest,local){
  const changed=edits(form());apply(latest,null,local);
  for(const [field,value] of Object.entries(changed))$(field).value=value;
}
function showOutlineConflict(latest){
  clearPreview();outlineConflict=latest.revision;
  const serverNode=nodeById(selected,latest);
  $('node-conflict-revision').textContent='服务器修订 '+latest.revision+' · '+(serverNode?'所选节点正文':'所选节点已不在大纲中');
  $('node-latest').textContent=serverNode?.body??'';$('node-conflict').hidden=false;
  status('大纲修订冲突。草稿仍保留，操作未重放。');
}
function outlineRequest(op){return {actor_id:owner,expected_revision:note.revision,...op}}
async function outlineChange(op){
  if(!note||outlineConflict||conflict)return;
  const draft=keepNodeDraft(),oldIds=new Set(note.outline.nodes.map(x=>x.id));
  try{
    const result=await request(path+'/'+note.id+'/nodes','PATCH',outlineRequest(op));
    if(op.action==='add'){
      draft.id=result.outline.nodes.find(x=>!oldIds.has(x.id))?.id;draft.body=undefined;
    }else if(op.action==='edit')draft.body=undefined;
    else if(op.action==='delete')draft.id=currentNode()?.parent_id;
    adoptOutline(result,draft);status('大纲已保存。');
  }catch(e){
    if(e.code==='OUTLINE_PREVIEW_REQUIRED')clearPreview();
    if(e.code!=='REVISION_CONFLICT')throw e;
    showOutlineConflict(await request(path+'/'+note.id));
  }
}
async function previewDelete(){
  try{
    const p=await request(path+'/'+note.id+'/delete-preview','POST',outlineRequest({node_id:selected}));
    preview={...p,node_id:selected};
    $('node-delete-summary').textContent=nodeName(currentNode())+' · '+p.child_ids.length+' 个直接子节点，'+p.descendant_ids.length+' 个后代';
    $('node-impact').replaceChildren(...p.descendant_ids.map(id=>{
      const li=document.createElement('li');li.textContent=(p.child_ids.includes(id)?'直接子节点：':'更深后代：')+nodeName(nodeById(id));return li;
    }));
    $('node-delete-review').hidden=false;
  }catch(e){if(e.code!=='REVISION_CONFLICT')throw e;showOutlineConflict(await request(path+'/'+note.id))}
}
const move=(parent_id,index)=>outlineChange({action:'move',node_id:selected,parent_id,index});
const reorder=by=>{
  const p=currentNode().parent_id;return move(p,children(p).findIndex(n=>n.id===selected)+by);
};
$('node-body').oninput=enabled;$('node-target').onchange=enabled;
$('node-add').onclick=()=>action(()=>outlineChange({action:'add',parent_id:selected,body:nodeDirty()?$('node-body').value:''}));
$('node-save').onclick=()=>action(()=>outlineChange({action:'edit',node_id:selected,body:$('node-body').value}));
$('node-up').onclick=()=>action(()=>reorder(-1));$('node-down').onclick=()=>action(()=>reorder(1));
$('node-indent').onclick=()=>action(()=>{
  const peers=children(currentNode().parent_id),sibling=peers[peers.findIndex(n=>n.id===selected)-1];return move(sibling.id,children(sibling.id).length);
});
$('node-promote').onclick=()=>action(()=>{
  const p=nodeById(currentNode().parent_id);return move(p.parent_id,children(p.parent_id).findIndex(n=>n.id===p.id)+1);
});
$('node-move').onclick=()=>action(()=>{const parent=$('node-target').value;return move(parent,children(parent).filter(n=>n.id!==selected).length)});
$('node-undo').onclick=()=>action(()=>outlineChange({action:'undo'}));$('node-preview').onclick=()=>action(previewDelete);
$('node-delete-cancel').onclick=()=>{clearPreview();enabled();$('node-preview').focus()};
for(const mode of ['subtree','promote'])$('node-delete-'+mode).onclick=()=>action(()=>outlineChange({action:'delete',node_id:preview.node_id,mode,preview_token:preview.preview_token}));
$('node-refresh').onclick=()=>action(async()=>{
  const latest=await request(path+'/'+note.id);
  if(latest.revision!==outlineConflict){showOutlineConflict(latest);return;}
  const local=keepNodeDraft(),missing=!nodeById(local.id,latest);adoptOutline(latest,local);
  status(missing&&local.body!==undefined?'原节点不可用，草稿保留在节点输入框。':'已读取最新大纲。草稿未保存，结构操作未重放。');
});
async function listMore(reset){const data=await request(path+(reset?'':'?after='+encodeURIComponent(next)));rows=reset?data.items:[...rows,...data.items.filter(i=>!rows.some(r=>r.id===i.id))];next=data.next;renderList()}
async function projectMore(reset){const data=await request(path+'/projects'+(reset?'':'?after='+encodeURIComponent(projectsNext)));projectsNext=data.next;
  for(const p of data.items){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('projects').append(o)}$('project-section').hidden=$('projects').options.length===1;$('more-projects').hidden=!projectsNext;
}
async function linkList(reset){
  const project=$('projects').value;
  if(reset){$('project-list').replaceChildren();$('more-links').hidden=true;linksNext=null}
  if(!project)return;
  const data=await request(path+'/projects/'+project+(reset?'':'?after='+encodeURIComponent(linksNext)));linksNext=data.next;
  $('project-list').append(...data.items.map(i=>item(i.title,()=>action(()=>open(i.id)))));$('more-links').hidden=!linksNext;
}
$('new').onclick=()=>action(()=>{if((dirty()||nodeDirty())&&!confirm('离开未保存的草稿？'))return;apply(null);history.replaceState(null,'','/knowledgeos/notes');status('新笔记。')});
$('more').onclick=()=>action(()=>listMore(false));$('more-projects').onclick=()=>action(()=>projectMore(false));$('more-links').onclick=()=>action(()=>linkList(false));
$('editor').onsubmit=e=>{e.preventDefault();void action(saveChanges)};
$('rebase').onclick=()=>action(async()=>{
  if(!conflict||!note)return;
  const changed=edits(form()),latest=await request(path+'/'+note.id);
  note={...note,references:latest.references};renderRefs();
  if(latest.revision!==conflict){showConflict(latest);status('服务器版本再次更新，草稿未覆盖。');return}
  apply(latest,null,keepNodeDraft());for(const [key,value] of Object.entries(changed))$(key).value=value;
  status('已保留草稿，尚未保存。');
});
$('projects').onchange=()=>action(()=>linkList(true));
$('link-project').onclick=()=>action(async()=>{const project=$('projects').value;if(!note||!project)return;await request(path+'/projects/'+project,'POST',{actor_id:owner,note_id:note.id});await linkList(true);status('项目引用已保存。')});
async function checkVisible(){
  if(document.hidden||busy||locked||checking||!owner)return;checking=true;
  try{await checkAccount();if(note){const refreshed=await request(path+'/'+note.id);note={...note,references:refreshed.references};renderRefs()}$('workspace').hidden=false}
  catch{if(!locked)$('workspace').hidden=true}
  finally{checking=false;enabled()}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)$('workspace').hidden=true;else void checkVisible()});
setInterval(checkVisible,10000);
void action(async()=>{
  try{await listMore(true);await projectMore(true);
    if(uuid(desired)){const saved=await request(path+'/'+desired);apply(saved)}else apply(null,uuid(citation)?citation:null);
    $('workspace').hidden=document.hidden;status(note?'已打开笔记。':'新笔记。');
  }catch(e){if(e.code==='NOTE_NOT_FOUND'&&!locked){apply(null);$('workspace').hidden=document.hidden}throw e}
});
</script></body></html>`;
}

// src/host/recall-page.ts
function buildRecallHtml() {
  return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>遮挡背诵 · KnowledgeOS</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f8faf9;color:#223638;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:#fff;border-bottom:1px solid #cedbd7}header nav,main{max-width:1040px;margin:auto;padding:0 20px}nav,.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}nav{min-height:54px}nav strong{font-size:18px;color:#18565a;margin-right:6px}main{padding-block:20px}h1,h2,h3,p{margin:0}h1{font-size:25px}h2{font-size:18px}h3{font-size:15px}a{color:#176166;text-underline-offset:3px}button,input,select{font:inherit;color:inherit;padding:5px 9px;border:1px solid #8a9d99;border-radius:5px;background:#fff}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}button.primary{color:#fff;background:#226461}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #176d92;outline-offset:2px}#status,#practice-meta,#selection-meta{color:#516667;min-height:1.6em;margin:6px 0}section{margin-top:15px}#author-tools{position:sticky;top:0;z-index:1;background:#f8faf9;border-block:1px solid #cedbd7;padding:8px 0}#pages article{border-bottom:1px solid #cedbd7;padding:11px 0}#pages h3{color:#346465}pre,.practice-text{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;line-height:1.65}pre{user-select:text}input{max-width:100%}ul{padding:0;list-style:none;margin:8px 0}li{padding:6px 0;border-bottom:1px solid #dce6e3;overflow-wrap:anywhere}#groups li{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.masked{background:#dbe9e3;color:#244b48;font-weight:600;padding:0 4px;border-bottom:2px solid #92ada4}.warn{color:#8c521d}.muted{color:#536866}label{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}.progress{margin:8px 0}
@media(max-width:620px){header nav,main{padding-inline:12px}#author-tools{position:static}.bar{gap:6px}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/recall" aria-current="page">遮挡背诵</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>遮挡背诵</h1><p id="status" role="status">正在读取…</p>
<section id="collection" hidden><h2>我的练习</h2><ul id="materials"></ul><button id="more" hidden>更多练习</button></section>
<section id="author" hidden><h2 id="source-title"></h2><div id="author-tools"><div class="bar"><button id="range">设为练习范围</button><button id="mask" disabled>添加为遮挡组</button><button id="clear-masks" disabled>清除分组</button><span id="selection-meta" aria-live="polite"></span></div><div class="bar"><label>练习名称 <input id="title" maxlength="200"></label><button id="create" class="primary" disabled>保存并练习</button></div></div>
<button id="prev-page" hidden>加载上一页</button><div id="pages"></div><button id="next-page" hidden>加载下一页</button></section>
<section id="practice" hidden><h2 id="practice-title"></h2><div class="bar"><button id="prev" aria-label="上一练习页">←</button><span id="practice-meta"></span><button id="next" aria-label="下一练习页">→</button><a id="original" target="_blank" rel="noopener noreferrer">固定版本原文</a><a href="/knowledgeos/recall">我的练习</a></div>
<p id="version-warning" class="warn" hidden>来源已有变化；保留旧练习，未迁移选区。</p><div id="practice-text" class="practice-text"></div><ul id="groups"></ul>
<p id="progress" class="progress muted"></p><div class="bar"><label>自评 <select id="rating"><option value="">未评分</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label><button id="rate">保存自评</button></div></section></main>
<script>
const $=id=>document.getElementById(id),api='/knowledge/v1/recall',q=new URL(location.href).searchParams;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const source={asset_id:q.get('asset'),version_id:q.get('version'),...(q.has('conversion')?{conversion_id:q.get('conversion')}:{})}, starting=Math.max(1,Number(q.get('unit'))||1);
let owner=null,view=null,busy=false,locked=false,loaded=new Map(),total=0,range=null,masks=[],nextGroup=1,attempt=null,cursor=null,materialId=q.get('material'),pending=null;
const status=text=>$('status').textContent=text;
function fail(code){const e=new Error(code);e.code=code;throw e}
function conceal(){for(const section of ['collection','author','practice'])$(section).hidden=true}
function clear(){conceal();pending=null;attempt=null;range=null;masks=[];loaded.clear();for(const id of ['materials','pages','practice-text','groups','progress','practice-title','source-title'])$(id).replaceChildren();$('original').removeAttribute('href');$('title').value='';getSelection().removeAllRanges()}
async function raw(path,init){const r=await fetch(path,{cache:'no-store',redirect:'error',credentials:'same-origin',...init});const j=await r.json();if(!r.ok)fail(j.code);return j.data}
async function checkActor(){const a=await raw('/knowledge/v1/me');if(!uuid(a?.id)||owner&&a.id!==owner)fail('ACTOR_CHANGED');owner=a.id}
async function call(path,method='GET',body,key){
  const data=await raw(path,body?{method,headers:{'content-type':'application/json','x-knowledgeos-request':'1','idempotency-key':key},body:JSON.stringify({actor_id:owner,...body})}:{});
  await checkActor();if(data.actor_id!==owner)fail('ACTOR_CHANGED');return data;
}
const errors={AUTH_REQUIRED:'请重新登录后刷新。',ACTOR_CHANGED:'账号已切换，请刷新页面。',SOURCE_NOT_FOUND:'来源不可用。',RECALL_NOT_FOUND:'练习或来源不可用。',RECALL_SOURCE_NOT_READY:'此页暂未提供已解析文本。',RECALL_SOURCE_CHANGED:'来源与保存的页段不一致。',RECALL_CONVERSION_REQUIRED:'请在固定转换版本的阅读器打开。',REVISION_CONFLICT:'已有更新，已重新读取进度。',INVALID_RECALL_RANGE:'范围无效，请核对选区及遮挡重叠。',RECALL_NOT_INDEPENDENT:'已使用提示或揭示，不能记为独立回忆。'};
const restricted=new Set(['AUTH_REQUIRED','ACTOR_CHANGED','SOURCE_NOT_FOUND','RECALL_NOT_FOUND','RECALL_SOURCE_CHANGED','CSRF_REJECTED']);
async function action(fn,{background=false}={}){
  if(busy||locked)return;busy=true;try{await checkActor();await fn();if(!document.hidden&&view)$(view).hidden=false}catch(e){
    if(restricted.has(e.code)){clear();locked=true}
    else if(background)conceal();
    status(errors[e.code]||'操作失败，未确认的提交可以重试。');
  }finally{busy=false}
}
function item(text,click){const node=document.createElement('button');node.type='button';node.textContent=text;node.onclick=click;return node}
function list(reset){return call(api+(reset?'':'?after='+encodeURIComponent(cursor))).then(data=>{
  if(reset)$('materials').replaceChildren();for(const m of data.items){const li=document.createElement('li'),a=document.createElement('a');a.href='?material='+encodeURIComponent(m.id);a.textContent=m.title;li.append(a);$('materials').append(li)}
  cursor=data.next;$('more').hidden=!cursor;view='collection';status($('materials').children.length?'':'暂无练习。');
})}
async function addPage(n){
  if(n<1||total&&n>total||loaded.has(n))return;
  const payload=await call(api+'/source?'+new URLSearchParams({...source,ordinal:String(n)}));if(payload.ordinal!==n||total&&payload.total!==total)fail('RECALL_SOURCE_CHANGED');total=payload.total;
  const section=document.createElement('article'),h=document.createElement('h3'),text=document.createElement('pre');h.textContent='页段 '+n+' / '+total;text.dataset.ordinal=String(n);text.textContent=payload.text;
  if(!payload.text){h.append(' · 空白页');text.setAttribute('aria-label','空白页')}section.append(h,text);
  const next=[...$('pages').children].find(e=>Number(e.lastChild.dataset.ordinal)>n);$('pages').insertBefore(section,next||null);
  if(next)next.scrollIntoView({block:'start'});
  loaded.set(n,payload);$('source-title').textContent=payload.title;if(!$('title').value)$('title').value=payload.title;
  $('prev-page').hidden=Math.min(...loaded.keys())<=1;$('next-page').hidden=Math.max(...loaded.keys())>=total;view='author';status('');
}
function selected(){
  const s=getSelection();if(!s.rangeCount||s.isCollapsed)fail('INVALID_RECALL_RANGE');const r=s.getRangeAt(0);
  function edge(node,offset){const el=node.parentElement,ordinal=Number(el?.dataset.ordinal),part=loaded.get(ordinal);if(node.nodeType!==3||!part||!$('pages').contains(el))fail('INVALID_RECALL_RANGE');return {ordinal,offset,source_hash:part.source_hash}}
  return {first:edge(r.startContainer,r.startOffset),last:edge(r.endContainer,r.endOffset)};
}
function updateAuthor(){
  $('mask').disabled=!range;$('clear-masks').disabled=!masks.length;$('create').disabled=!masks.length;
  $('selection-meta').textContent=range?'页段 '+range.first.ordinal+'–'+range.last.ordinal+' · '+new Set(masks.map(x=>x.group)).size+' 组':'';
}
function useRange(){
  const {first,last}=selected(),interior_hashes=[];
  for(let n=first.ordinal+1;n<last.ordinal;n++){
    const part=loaded.get(n);if(!part)fail('RECALL_SOURCE_NOT_READY');interior_hashes.push(part.source_hash);
  }
  range={first,last,interior_hashes};masks=[];nextGroup=1;updateAuthor();status('练习范围已选定。');
}
function useMask(){
  const {first,last}=selected(),group=nextGroup,parts=[];
  for(let n=first.ordinal;n<=last.ordinal;n++){
    const part=loaded.get(n);if(!part||n<range.first.ordinal||n>range.last.ordinal)fail('INVALID_RECALL_RANGE');
    const start=n===first.ordinal?first.offset:0,end=n===last.ordinal?last.offset:part.text.length;
    if(start<(n===range.first.ordinal?range.first.offset:0)||end>(n===range.last.ordinal?range.last.offset:part.text.length))fail('INVALID_RECALL_RANGE');
    if(end>start)parts.push({ordinal:n,start,end,group});
  }
  if(!parts.length||parts.some(p=>masks.some(m=>m.ordinal===p.ordinal&&m.start<p.end&&p.start<m.end)))fail('INVALID_RECALL_RANGE');
  masks.push(...parts);nextGroup++;updateAuthor();status('已添加遮挡组 '+group+'。');
}
function keyFor(body){const digest=JSON.stringify(body);if(pending?.digest!==digest)pending={digest,key:crypto.randomUUID()};return pending.key}
async function save(){
  const title=$('title').value.trim();if(!title){$('title').focus();status('请输入练习名称。');return}
  const body={...source,title,...range,masks};const saved=await call(api,'POST',body,keyFor(body));
  clear();materialId=saved.material.id;history.replaceState(null,'','?material='+encodeURIComponent(materialId));draw(saved);status('练习已保存。');
}
function draw(data){
  attempt=data;view='practice';const {material:m,ordinal,first,last,length,progress:r}=data;
  $('practice-title').textContent=m.title;$('practice-meta').textContent='页段 '+ordinal+' / '+last+' · 本页 '+data.page_length+' / 选区 '+length+' 个 UTF-16 单元';
  $('original').href='/knowledgeos/reader?'+new URLSearchParams({asset:m.asset_id,version:m.version_id,unit:String(ordinal),...(m.conversion_id?{conversion:m.conversion_id}:{})});
  $('version-warning').hidden=!data.source_changed;$('prev').disabled=ordinal<=first;$('next').disabled=ordinal>=last;
  $('practice-text').replaceChildren();$('groups').replaceChildren();const groups=new Map();
  for(const part of data.runs){if(part.kind==='text')$('practice-text').append(document.createTextNode(part.text));else{
    const span=document.createElement('span');span.className='masked';span.textContent='［组 '+part.group+'］';$('practice-text').append(span);groups.set(part.group,(groups.get(part.group)||0)+part.length);
  }}
  for(const [g,len] of groups){const li=document.createElement('li'),hint=r.hints.find(x=>x.group===g);
    const label=document.createElement('span');label.textContent='组 '+g+(hint?' · 本页 '+len+' 个 UTF-16 单元':'');li.append(label,item('提示 '+g,()=>action(()=>act('hint',g))),item('揭示 '+g,()=>action(()=>act('reveal',g))));
    const recall=item('独立回忆 '+g,()=>action(()=>act('recall',g)));recall.disabled=!!hint||r.independent_recall.includes(g);li.append(recall);$('groups').append(li);
  }
  $('rating').value=r.self_rating??'';$('progress').textContent='提示 '+r.hints.reduce((n,h)=>n+h.count,0)+' · 已揭示 '+r.revealed.length+' 组 · 独立回忆 '+r.independent_recall.length+' 组 · 自评 '+(r.self_rating??'未评分');
}
async function act(event,value){
  if(!attempt||!value)return;const body={event,value,expected_revision:attempt.revision};
  try{draw(await call(api+'/'+materialId,'PATCH',body,keyFor(body)));pending=null;status('进度已保存。')}
  catch(e){if(e.code==='REVISION_CONFLICT'){pending=null;draw(await call(api+'/'+materialId))}throw e}
}
async function refresh(){
  if(view==='collection'){await list(true);return}
  if(view==='practice'){
    const next=await call(api+'/'+materialId);
    if(next.revision===attempt.revision&&next.source_changed===attempt.source_changed)return;
    const rating=$('rating').value,unsaved=rating!==String(attempt.progress.self_rating??''),focused=document.activeElement?.textContent;
    const hadGroupFocus=$('groups').contains(document.activeElement);draw(next);if(unsaved)$('rating').value=rating;
    if(hadGroupFocus)([...$('groups').querySelectorAll('button:not(:disabled)')].find(b=>b.textContent===focused)||$('original')).focus({preventScroll:true});
    return;
  }
  if(view==='author'&&loaded.size){const n=loaded.keys().next().value,p=await call(api+'/source?'+new URLSearchParams({...source,ordinal:String(n)}));if(p.source_hash!==loaded.get(n).source_hash)fail('RECALL_SOURCE_CHANGED')}
}
for(const id of ['range','mask'])$(id).onmousedown=e=>e.preventDefault();
$('range').onclick=()=>{try{useRange()}catch(e){status(errors[e.code])}};$('mask').onclick=()=>{try{useMask()}catch(e){status(errors[e.code])}};
$('clear-masks').onclick=()=>{masks=[];nextGroup=1;updateAuthor()};$('create').onclick=()=>action(save);
$('prev-page').onclick=()=>action(()=>addPage(Math.min(...loaded.keys())-1));$('next-page').onclick=()=>action(()=>addPage(Math.max(...loaded.keys())+1));
$('more').onclick=()=>action(()=>list(false));$('prev').onclick=()=>action(()=>act('move',attempt.ordinal-1));$('next').onclick=()=>action(()=>act('move',attempt.ordinal+1));$('rate').onclick=()=>action(()=>act('rating',Number($('rating').value)));
document.addEventListener('visibilitychange',()=>{conceal();if(!document.hidden)void action(refresh,{background:true})});
window.addEventListener('pagehide',conceal);window.addEventListener('pageshow',e=>{if(e.persisted)void action(refresh,{background:true})});
setInterval(()=>{if(!document.hidden)void action(refresh,{background:true})},10000);
void action(async()=>{if(uuid(materialId)){draw(await call(api+'/'+materialId));status('')}
  else if(uuid(source.asset_id)&&uuid(source.version_id)){await addPage(starting)}else await list(true);
});
</script></body></html>`;
}

// src/host/invitation-page.ts
function buildInvitationHtml() {
  return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邀请码 · KnowledgeOS</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f7faf9;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:white;border-bottom:1px solid #cbd9d6}header nav,main{max-width:1000px;margin:auto;padding:12px 20px}nav,.row,form{display:flex;gap:10px;align-items:center;flex-wrap:wrap}nav strong,a{color:#185d60}h1{font-size:24px;margin:6px 0}h2{font-size:17px;margin:4px 0 10px}section{border-top:1px solid #cbd9d6;padding:14px 0}input,select,button{font:inherit;color:inherit;background:white;border:1px solid #9bb1ac;border-radius:5px;padding:5px 8px;max-width:100%}button{cursor:pointer}button.primary{background:#245d5a;color:white}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #176d92;outline-offset:2px}#token{width:29em}#days,#uses,#renew-days{width:5em}#issued-code{overflow-wrap:anywhere;font-family:Consolas,monospace}#status{min-height:1.6em;color:#506864}label{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}ul{padding:0;list-style:none}li{display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid #d2ddda;padding:9px 0}#managed{min-width:0}#managed ul{overflow-wrap:anywhere}#confirm-panel{margin:8px 0;color:#814c25}@media(max-width:600px){header nav,main{padding-inline:12px}form{align-items:flex-end}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/invitations" aria-current="page">邀请码</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>邀请码</h1><p id="status" role="status">正在读取…</p><div id="workspace" hidden>
<section><h2>兑换邀请码</h2><form id="redeem"><label>邀请码 <input id="token" required maxlength="43" autocomplete="off" spellcheck="false"></label><button class="primary">兑换</button></form><p id="redeemed" hidden></p></section>
<section><h2>创建邀请码</h2><form id="issue"><label>范围 <select id="scope"><option value="object">指定资料</option><option value="project">项目成员</option></select></label><label id="asset-label">资料 <select id="assets" required></select></label><label id="project-label" hidden>项目 <select id="projects" disabled required></select></label><label id="permission-label">权限 <select id="permission"><option value="read">只读</option><option value="edit">阅读与编辑</option></select></label><label>有效天数 <input id="days" type="number" min="1" max="90" value="7" required></label><label>最多人数 <input id="uses" type="number" min="1" max="100" value="1" required></label><button>预览</button></form><div id="preview" class="row" hidden><span id="issue-preview"></span><button id="create" class="primary">确认创建</button><button id="cancel-issue">取消</button></div><p id="created" hidden><strong>邀请码：</strong><output id="issued-code"></output> <button id="copy" type="button">复制邀请码</button></p></section>
<section><h2>已创建的邀请</h2><ul id="invitations"></ul><div id="managed" hidden><h2 id="managed-title"></h2><p id="managed-meta"></p><ul id="affected"></ul><div class="row" id="manage-tools"><label>续期天数 <input id="renew-days" type="number" min="1" max="90" value="7"></label><button id="preview-renew">预览整组续期</button><button id="preview-revoke">预览撤销</button></div><div class="row" id="confirm-panel" hidden><span id="change-preview"></span><button id="confirm-change" class="primary">确认操作</button><button id="cancel-change">取消</button></div></div></section></div></main>
<script>
const $=k=>document.getElementById(k),api='/knowledge/v1/invitations',query=new URL(location.href).searchParams;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const labels={read:'只读',edit:'阅读与编辑',member:'项目成员'},status=s=>$('status').textContent=s;
let owner=null,busy=false,reloadPending=false,epoch=0,issue=null,requestKey=null,current=null,change=null;
const format=s=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(s));
function remaining(end,now){let minutes=Math.ceil(Math.max(0,Date.parse(end)-Date.parse(now))/60000);return minutes>=1440?Math.floor(minutes/1440)+' 天 '+Math.floor(minutes%1440/60)+' 小时':Math.floor(minutes/60)+' 小时 '+minutes%60+' 分钟'}
const term=(end,now)=>format(end)+' · 剩余 '+remaining(end,now);
function error(code){const e=new Error(code);e.code=code;throw e}
async function raw(url,body,key){
  const opts=body?{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1',...(key?{'idempotency-key':key}:{})},body:JSON.stringify({actor_id:owner,...body})}:{};
  const r=await fetch(url,{cache:'no-store',credentials:'same-origin',redirect:'error',...opts});const data=await r.json();if(!r.ok)error(data.code||'FAILED');return data.data;
}
function hideCode(){$('issued-code').textContent='';$('created').hidden=true;$('token').value=''}
function conceal(){++epoch;$('workspace').hidden=true;hideCode();$('redeemed').hidden=true;$('redeemed').replaceChildren();$('preview').hidden=true;$('managed').hidden=true;$('confirm-panel').hidden=true;issue=current=change=null}
async function session(g){const a=await raw('/knowledge/v1/me');if(g!==epoch)error('STALE');if(!uuid(a?.id)||owner&&a.id!==owner){conceal();error('ACTOR_CHANGED')}owner=a.id}
async function call(g,path='',body,key){const d=await raw(api+path,body,key);await session(g);if(d.actor_id!==owner)error('ACTOR_CHANGED');return d}
const messages={INVITATION_UNAVAILABLE:'邀请不可用或未获授权。',INVITATION_FULL:'该邀请码已无剩余名额。',INVITATION_CHANGED:'邀请已变化，请重新预览。',AUTH_REQUIRED:'请登录后刷新。',SESSION_EXPIRED:'请登录后刷新。',ACTOR_CHANGED:'账号已切换，请刷新。',IDEMPOTENCY_CONFLICT:'请求内容已变化，请重新预览。'};
async function run(fn){if(busy)return;busy=true;const g=epoch;try{await session(g);await fn(g);if(g===epoch&&!document.hidden)$('workspace').hidden=false}
  catch(e){if(g===epoch&&e.code!=='STALE'){if(['SESSION_EXPIRED','AUTH_REQUIRED','ACTOR_CHANGED'].includes(e.code))conceal();status(messages[e.code]||'操作失败，请重试。')}}finally{busy=false;if(reloadPending){reloadPending=false;if(!document.hidden)void run(load)}}}
function scope(){const project=$('scope').value==='project';$('asset-label').hidden=project;$('assets').disabled=project;$('project-label').hidden=!project;$('projects').disabled=!project;$('permission-label').hidden=project}
function draft(){const object=$('scope').value==='object';return {scope:object?'object':'project',target_id:$(object?'assets':'projects').value,permission:object?$('permission').value:'member',days:$('days').valueAsNumber,max_redemptions:$('uses').valueAsNumber}}
function setChoices(select,items,preferred){select.replaceChildren(new Option('请选择',''),...items.map(x=>new Option(x.title,x.id)));if(items.some(x=>x.id===preferred))select.value=preferred}
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
async function list(g){const d=await call(g);$('invitations').replaceChildren(...d.items.map(x=>{
  const li=node('li',''),b=node('button','管理邀请');b.type='button';b.onclick=()=>run(k=>manage(k,x.id));
  li.append(node('strong',x.title),node('span',labels[x.target.permission]+' · '+x.redeemed_count+'/'+x.max_redemptions+' · '+(x.active?format(x.expires_at):x.revoked_at?'已撤销':'已到期')),b);return li;
}));if(!d.items.length)$('invitations').append(node('li','暂无邀请。'))}
async function load(g){const result=await Promise.all([raw('/knowledge/v1/assets'),raw('/knowledge/v1/projects')]);await session(g);
  const seen=new Map();for(const item of result[0].items)if(!seen.has(item.id))seen.set(item.id,item);
  setChoices($('assets'),[...seen.values()],query.get('asset'));setChoices($('projects'),result[1].items,query.get('project'));if(query.has('project'))$('scope').value='project';scope();await list(g);status('');}
async function manage(g,id){current=change=null;$('confirm-panel').hidden=true;$('managed').hidden=true;
  const d=await call(g,'/'+id);
  $('managed-title').textContent=d.title;$('managed-meta').textContent=term(d.expires_at,d.server_time);
  $('affected').replaceChildren(...d.affected.map(a=>node('li','已兑换授权 '+a.id.slice(0,8)+' · '+format(a.expires_at))));$('manage-tools').hidden=!d.active;
  current=d;$('managed').hidden=false;}
$('scope').onchange=scope;$('issue').oninput=()=>{$('preview').hidden=true;issue=null};
$('issue').onsubmit=e=>{e.preventDefault();void run(async g=>{hideCode();const d=draft(),p=await call(g,'/preview',d);issue=d;requestKey=crypto.randomUUID();$('issue-preview').textContent=p.title+' · '+labels[p.target.permission]+' · '+term(p.expires_at,p.server_time)+' · '+p.max_redemptions+' 人';$('preview').hidden=false;})};
$('create').onclick=()=>{if(!issue)return;void run(async g=>{const p=await call(g,'',issue,requestKey);issue=null;$('preview').hidden=true;if(p.token){$('issued-code').textContent=p.token;$('created').hidden=false}status(p.token?'已创建 · '+term(p.expires_at,p.server_time):'邀请已创建。已确认的原码不会再次显示。');await list(g)})};
$('cancel-issue').onclick=()=>{issue=null;$('preview').hidden=true};$('copy').onclick=()=>{const code=$('issued-code').textContent;if(code)void navigator.clipboard.writeText(code).then(()=>status('邀请码已复制。'),()=>status('无法访问剪贴板。'))};
$('redeem').onsubmit=e=>{e.preventDefault();const token=$('token').value.trim();void run(async g=>{const d=await call(g,'/redeem',{token});$('token').value='';$('redeemed').textContent=d.title+' · '+labels[d.target.permission]+' · '+term(d.expires_at,d.server_time);$('redeemed').hidden=false;status(d.replayed?'已确认此前兑换。':'兑换成功。');})};
function prepare(event){if(!current?.active)return;const days=$('renew-days').valueAsNumber;if(event==='renew'&&!$('renew-days').reportValidity())return;
  change={event,id:current.id,revision:current.revision,days,key:crypto.randomUUID()};const n=current.affected.length;
  $('change-preview').textContent=event==='revoke'?'撤销会同时终止 '+n+' 份有效派生授权。':n+' 份有效派生授权的截止从 '+format(current.expires_at)+' 延长至 '+format(new Date(Date.parse(current.expires_at)+days*86400000).toISOString())+'。';$('confirm-panel').hidden=false;}
$('preview-renew').onclick=()=>prepare('renew');$('preview-revoke').onclick=()=>prepare('revoke');$('cancel-change').onclick=()=>{change=null;$('confirm-panel').hidden=true};
$('confirm-change').onclick=()=>{const x=change;if(!x)return;void run(async g=>{try{const d=await call(g,'/'+x.id+'/'+x.event,{expected_revision:x.revision,...(x.event==='renew'?{days:x.days}:{})},x.key);status('已更新 '+d.affected_count+' 份派生授权。')}
  catch(e){if(g===epoch&&!e.code){status('未收到确认。可使用当前预览重新确认。');return}throw e}
  change=null;$('confirm-panel').hidden=true;await manage(g,x.id);await list(g)})};
function reloadWhenVisible(){if(document.hidden)return;if(busy)reloadPending=true;else void run(load)}
document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal();else reloadWhenVisible()});window.addEventListener('pagehide',conceal);window.addEventListener('pageshow',e=>{if(e.persisted)reloadWhenVisible()});
void run(load);
</script></body></html>`;
}

// src/host/index.ts
var name = "knowledgeos-panel";
var inject = ["webServer", "clientModules", "connection", "connection.authentication"];
var STATUS_PATH = "/knowledgeos/status";
var RECORDS_PATH = "/knowledgeos/foundation/records";
var ACCOUNT_PATH = "/knowledgeos/account";
var SETUP_PATH = "/knowledgeos/setup";
var IDENTITY_API_PATH = "/knowledge/v1";
var RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff"
};
function wait(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
function apply(ctx, config = {}) {
  const instanceId = globalThis.crypto.randomUUID();
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const log = (message) => {
    console.log(message);
  };
  ctx.effect(() => {
    const readRelease = () => {
      try {
        return ctx.clientModules.graph().release;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`knowledgeos-panel: reading host release failed: ${message}`);
        return void 0;
      }
    };
    return ctx.webServer.register({
      kind: "exact",
      path: STATUS_PATH,
      auth: "required",
      resource: async () => {
        const payload = buildStatusPayload({
          release: readRelease(),
          instanceId,
          startedAt,
          checkedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return new Response(JSON.stringify(payload), { status: 200, headers: RESPONSE_HEADERS });
      }
    });
  }, "knowledgeos-panel: read-only status route");
  const dataDir = resolveDataDir(config);
  const storage = dataDir === void 0 ? void 0 : new ProbeStorage({
    dataDir,
    log
  });
  if (storage === void 0) log("knowledgeos-storage: unconfigured");
  if (storage?.available) ctx.effect(() => startWorker(storage.jobs, log), "knowledgeos-jobs: checkpoint worker");
  let closing = false;
  const inFlight = /* @__PURE__ */ new Set();
  const service = {
    create(idempotencyKey, content) {
      if (closing) throw new RecordsError("STORAGE_CLOSED", "storage is closing");
      if (storage === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "storage is not configured");
      return createProbeRecord(storage, {
        newId: () => randomUUID25(),
        now: () => (/* @__PURE__ */ new Date()).toISOString()
      }, { idempotencyKey, content });
    },
    get(id4) {
      if (closing) throw new RecordsError("STORAGE_CLOSED", "storage is closing");
      if (storage === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "storage is not configured");
      return getProbeRecord(storage, id4);
    }
  };
  const handlers = createRecordsHandlers(service, RECORDS_PATH, log);
  const wrap = (handler) => {
    return (req, res) => {
      const pending = handler(req, res);
      inFlight.add(pending);
      void pending.finally(() => {
        inFlight.delete(pending);
      });
      return pending;
    };
  };
  ctx.effect(() => {
    const disposeCreate = ctx.webServer.register({
      kind: "exact",
      path: RECORDS_PATH,
      auth: "required",
      handler: wrap(handlers.create)
    });
    const disposeRead = ctx.webServer.register({
      kind: "prefix",
      path: RECORDS_PATH,
      auth: "required",
      handler: wrap(handlers.read)
    });
    return async () => {
      closing = true;
      disposeCreate();
      disposeRead();
      if (inFlight.size > 0) {
        await Promise.race([Promise.allSettled([...inFlight]), wait(5e3)]);
      }
      storage?.close();
    };
  }, "knowledgeos-storage: records routes and connection");
  const webFacts = ctx.webServer;
  const actualOrigin = () => {
    try {
      const explicit = webFacts.getOrigin?.();
      if (explicit !== void 0) return explicit;
    } catch {
      return void 0;
    }
    return void 0;
  };
  const sendIdentityUnavailable = (req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/knowledgeos/account")) {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(buildAccountHtml());
      return;
    }
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ code: "STORAGE_UNAVAILABLE", message: "storage is not configured", request_id: randomUUID25(), retryable: true, safe_details: {} }));
  };
  const registerIdentityRoutes = (identityContext) => {
    const identityAvailable = () => {
      let connection;
      try {
        connection = ctx.connection;
      } catch {
        return false;
      }
      return isIdentityRuntimeAvailable({ connection, host: webFacts.host, port: webFacts.port, protocol: webFacts.protocol, origin: actualOrigin() });
    };
    const identity = new IdentityService(storage);
    const route = () => config.ai ?? identityContext.get("agentDefaultModel")?.currentSelection() ?? {};
    let ai = new AiService(storage, route());
    identityContext.inject(["llm", "tools"], (aiContext) => {
      aiContext.effect(() => {
        ai.close();
        let active4;
        try {
          active4 = new AiService(storage, route(), aiContext.llm, aiContext.tools);
        } catch {
          console.warn("knowledgeos-ai: TOOL_REGISTRATION_FAILED");
          ai = new AiService(storage, route());
          return () => ai.close();
        }
        ai = active4;
        return () => {
          active4.close();
          if (ai === active4) ai = new AiService(storage, route());
        };
      }, "knowledgeos-ai: controlled tools");
    });
    const identityHandlers = createIdentityHandlers({
      service: identity,
      origin: actualOrigin,
      host: () => webFacts.host,
      protocol: () => webFacts.protocol ?? "http:",
      isAvailable: identityAvailable
    });
    const ownerSetupPage = (req, res, peer) => {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.setHeader("allow", "GET");
        res.end();
        return;
      }
      if (!identityAvailable()) {
        res.statusCode = 503;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("identity service is unavailable");
        return;
      }
      const principal = peer?.principal;
      if (principal?.kind !== "owner" || !isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackAddress(webFacts.host)) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(buildSetupHtml());
    };
    const accountPage = (req, res) => {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.setHeader("allow", "GET");
        res.end();
        return;
      }
      if (!identityAvailable()) {
        res.statusCode = 503;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("identity service is unavailable");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(buildAccountHtml().replace("</main>", '<p><a href="/knowledgeos/library">\u77E5\u8BC6\u5E93</a> \xB7 <a href="/knowledgeos/ai">\u53D7\u63A7 AI \u5DE5\u5177</a></p></main>'));
    };
    const withPeer = (handler) => {
      return (req, res, peer) => {
        const pending = handler(req, res, peer);
        inFlight.add(pending);
        void pending.finally(() => {
          inFlight.delete(pending);
        });
        return pending;
      };
    };
    let officeMount, readLegacyWord;
    if (storage?.available && dataDir) {
      const office = storage.office, originals = new PdfOriginals(join3(dataDir, "originals"));
      identityContext.inject(["officeKit"], (scope) => {
        scope.effect(() => {
          const stop = startOfficeWorker(office, originals, scope.officeKit, openPdf, log), mount = Symbol();
          officeMount = mount;
          readLegacyWord = legacyWordSource(scope.officeKit, originals);
          return async () => {
            if (officeMount === mount) {
              officeMount = void 0;
              readLegacyWord = void 0;
            }
            await stop();
          };
        }, "knowledgeos-office: versioned conversion worker");
      });
    }
    identityContext.effect(() => {
      const disposers = [];
      disposers.push(identityContext.webServer.register({ kind: "exact", path: ACCOUNT_PATH, auth: "anonymous", handler: accountPage }));
      if (storage && dataDir) {
        const originals = new PdfOriginals(join3(dataDir, "originals"));
        const reader = new ReaderService(storage.citations, originals, render, openReaderPdf, (s, check, signal) => {
          if (!readLegacyWord) throw new Error("Office structure conversion unavailable");
          return readLegacyWord(s, check, signal);
        });
        const sessionFor = (req) => {
          const origin = actualOrigin();
          if (!origin || !identityAvailable()) return void 0;
          return identity.actor(readCookie(req, businessCookieName(identity.setupState.serviceId, origin)));
        };
        const handler = libraryHandler(storage.assets, originals, actualOrigin, sessionFor, storage.parses, storage.office, () => !!officeMount, storage.archives, reader, storage.search);
        const notes = createNoteHandler(storage.notes, actualOrigin, sessionFor);
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/invitations", auth: "anonymous", handler: withPeer(createInvitationHandler(storage.invitations, actualOrigin, sessionFor)) }));
        disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/invitations", auth: "anonymous", handler: (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
          res.end(buildInvitationHtml());
        } }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/recall", auth: "anonymous", handler: withPeer(createRecallHandler(storage.recall, actualOrigin, sessionFor)) }));
        disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/recall", auth: "anonymous", handler: (req, res) => {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end();
            return;
          }
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
          res.end(buildRecallHtml());
        } }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/notes", auth: "anonymous", handler: withPeer(notes) }));
        disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/notes", auth: "anonymous", handler: (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
          res.end(buildNotesHtml());
        } }));
        if (storage.available) disposers.push(startParseWorker(storage.parses, originals, openPdf, log), startWordSearchIndex(storage.wordSearch, originals, openIndexPdf, log));
        disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/library", auth: "anonymous", handler: (req, res) => {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end();
            return;
          }
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(buildLibraryHtml());
        } }));
        disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/reader", auth: "anonymous", handler: (req, res) => {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end();
            return;
          }
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.setHeader("referrer-policy", "no-referrer");
          res.end(buildReaderHtml());
        } }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/imports", auth: "anonymous", handler: withPeer(handler) }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/assets", auth: "anonymous", handler: withPeer(handler) }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/citations", auth: "anonymous", handler: withPeer(handler) }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/operations", auth: "anonymous", handler: withPeer(handler) }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/search", auth: "anonymous", handler: withPeer(handler) }));
      }
      disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/ai", auth: "anonymous", handler: (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        ;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(buildAiHtml());
      } }));
      const aiHandler = createAiHandler({ service: () => ai, origin: actualOrigin, actorFor: (req) => {
        const origin = actualOrigin();
        if (origin === void 0 || !identityAvailable()) return void 0;
        return identity.actor(readCookie(req, businessCookieName(identity.setupState.serviceId, origin)));
      } });
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/ai", auth: "anonymous", handler: withPeer(async (req, res) => aiHandler(req, res)) }));
      disposers.push(identityContext.webServer.register({ kind: "exact", path: SETUP_PATH, auth: "required", handler: ownerSetupPage }));
      const routes = [
        { path: "/knowledge/v1/auth/status", auth: "anonymous", handler: identityHandlers.status },
        { path: "/knowledge/v1/auth/bootstrap", auth: "required", handler: identityHandlers.bootstrap },
        { path: "/knowledge/v1/auth/register", auth: "anonymous", handler: identityHandlers.register },
        { path: "/knowledge/v1/auth/login", auth: "anonymous", handler: identityHandlers.login },
        { path: "/knowledge/v1/auth/logout", auth: "anonymous", handler: identityHandlers.logout },
        { path: "/knowledge/v1/me", auth: "anonymous", handler: identityHandlers.me },
        { path: "/knowledge/v1/me/preferences", auth: "anonymous", handler: identityHandlers.preferences },
        { path: "/knowledge/v1/spaces", auth: "anonymous", handler: identityHandlers.spaces }
      ];
      for (const route2 of routes) disposers.push(identityContext.webServer.register({ kind: "exact", path: route2.path, auth: route2.auth, handler: withPeer(route2.handler) }));
      const objectHandler = createObjectHandlers({
        storage,
        actorFor: (req) => {
          const origin = actualOrigin();
          if (origin === void 0) return void 0;
          const token2 = readCookie(req, businessCookieName(identity.setupState.serviceId, origin));
          return identity.actor(token2);
        },
        origin: actualOrigin
      });
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/objects", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/jobs", auth: "anonymous", handler: withPeer(objectHandler) }));
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/projects", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/grants", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      return async () => {
        ai.close();
        for (const dispose of disposers) await dispose();
        await identity.close();
      };
    }, "knowledgeos-identity: account and business routes");
  };
  if (storage === void 0) {
    ctx.effect(() => {
      const disposers = [];
      disposers.push(ctx.webServer.register({ kind: "exact", path: ACCOUNT_PATH, auth: "anonymous", handler: sendIdentityUnavailable }));
      disposers.push(ctx.webServer.register({ kind: "exact", path: SETUP_PATH, auth: "required", handler: sendIdentityUnavailable }));
      for (const path2 of ["/knowledge/v1/auth/status", "/knowledge/v1/auth/bootstrap", "/knowledge/v1/auth/register", "/knowledge/v1/auth/login", "/knowledge/v1/auth/logout", "/knowledge/v1/me", "/knowledge/v1/me/preferences", "/knowledge/v1/spaces"]) {
        disposers.push(ctx.webServer.register({ kind: "exact", path: path2, auth: path2.endsWith("/bootstrap") ? "required" : "anonymous", handler: sendIdentityUnavailable }));
      }
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "knowledgeos-identity: unavailable routes");
  } else {
    ctx.inject(["connection", "connection.authentication"], registerIdentityRoutes);
  }
}
export {
  ACCOUNT_PATH,
  Config,
  IDENTITY_API_PATH,
  RECORDS_PATH,
  SETUP_PATH,
  STATUS_PATH,
  apply,
  inject,
  name
};
/*! Bundled license information:

xmlchars/xml/1.0/ed5.js:
  (**
   * Character classes and associated utilities for the 5th edition of XML 1.0.
   *
   * @author Louis-Dominique Dubeau
   * @license MIT
   * @copyright Louis-Dominique Dubeau
   *)

xmlchars/xml/1.1/ed2.js:
  (**
   * Character classes and associated utilities for the 2nd edition of XML 1.1.
   *
   * @author Louis-Dominique Dubeau
   * @license MIT
   * @copyright Louis-Dominique Dubeau
   *)

xmlchars/xmlns/1.0/ed3.js:
  (**
   * Character class utilities for XML NS 1.0 edition 3.
   *
   * @author Louis-Dominique Dubeau
   * @license MIT
   * @copyright Louis-Dominique Dubeau
   *)
*/
