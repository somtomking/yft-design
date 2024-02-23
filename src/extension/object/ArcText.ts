
import { ArcTextMixin } from '../mixins/arctext.mixin'
import { IText as OriginIText, Textbox as OriginTextbox, Control, controlsUtils, classRegistry, Transform, TPointerEvent, TSVGReviver, util, Point, TMat2D } from 'fabric'
import { sectorBoundingBox } from '@/utils/geometry'
import { FabricObject } from 'fabric/src/shapes/Object/FabricObject'
export class ArcText extends OriginIText {
  static type: string = 'ArcText'
  public isCurvature? = false
  public curvature = 100
  public radius = 66
  public textRenders: any
  private __isMousedown: boolean = false
  private _linesRads: number[] = []
  private __lineInfo: any = []
  public _contentOffsetX: number = 0
  public _contentOffsetY: number = 0
  private _curvingCenter: any
  private _specialArray = []
  private _translatedX: number = 0
  private _translatedY: number = 0
  public useRenderBoundingBoxes: any
  private _charTransformations: any = []
  public textTransform = false
  public useBothRenderingMethod = true
  public accepts = { role: "fontFamily" }
  public storeProperties = ["type", "clipPath","frame","deco",'textLines','textTransform']
  public eventListeners = {}
  public textCase = "none"
  public isText = true
  public fontSizeOptions = [6,7,8,9,10,12,14,18,24,36,48,64]
  constructor(text: string, options: any) {
    super(text, options)
    this.createCurvatureControl()
  }

  get type() {
    return 'ArcText'
  }

  createCurvatureControl() {
    this.controls.c = new Control({
      x: 0,
      y: 0,
      offsetX: 0,
      actionHandler: this.changeCurvature,
      cursorStyle: 'pointer',
      actionName: 'resizing',
    })

    this.on("scaling", this.updateCurvingControl)
  }

  public get __isCurvature() {
    return this.isCurvature
  }

  public set __isCurvature(value) {
    console.log('__curvature:', value)
    this.isCurvature = value
    
    if (this.isCurvature) {
      this.createCurvatureControl()
    }
  }

  updateCurvingControl () {
    if (this.controls.c) {
      this.controls.c.offsetX =  -this._contentOffsetX * this.scaleX
      this.controls.c.offsetY = (this._curvingCenter.y - this._contentOffsetY) * this.scaleY
      this.canvas && this.setCoords()
    }
  }

  changeCurvature (eventData: TPointerEvent, transform: Transform, x: number, y: number) {
    const target = transform.target as ArcText;
    let localPoint = controlsUtils.getLocalPoint(transform, transform.originX, transform.originY, x, y),
      strokePadding = target.strokeWidth / (target.strokeUniform ? target.scaleX : 1),
      multiplier = transform.originY === 'center' ? 2 : 1,
      cy = (localPoint.y + target.controls[transform.corner].offsetY - target.height / 2 + target._contentOffsetY ) * multiplier / target.scaleY - strokePadding;
  
    let textHeight = target.calcTextHeight();
  
    let radius;
    if (Math.abs(cy) <= textHeight / 2) {
      radius = 0;
    }
    else{
      radius = cy > 0 ? cy - textHeight / 2 : cy + textHeight / 2;
    }
  
    target.set(radius)
    return false
  }

  renderCharCallback(method: any, ctx: CanvasRenderingContext2D, lineIndex: number, charIndex: number, endCharIndex: number, left: number, top: number, fullDecl: any) {
    for (let index = charIndex; index <= endCharIndex; index++) {
      let tr = this._charTransformations[lineIndex][index];
      ctx.textAlign = "center"
      if (tr.char) {
        let angle = this.curvature > 0 ? -tr.charAngle : -tr.charAngle - Math.PI
        if(tr.contour && fullDecl.contourStroke){
          ctx.save();
          ctx.lineWidth = fullDecl.contourStrokeWidth
          ctx.strokeStyle = fullDecl.contourStroke
          ctx.beginPath()
          ctx.moveTo(tr.contour.tl.x,tr.contour.tl.y)
          ctx.lineTo(tr.contour.tr.x,tr.contour.tr.y)
          ctx.lineTo(tr.contour.br.x,tr.contour.br.y)
          ctx.lineTo(tr.contour.bl.x,tr.contour.bl.y)
          ctx.closePath()
          ctx.stroke()
          ctx.restore()
        }
        this.runCharRendering(method, ctx, tr.char, tr.cl.x, tr.cl.y, angle, fullDecl, "center");
      }
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    super.render(ctx)
    if(this.group){
      this.group._transformDone = false;
    }
    this.clearContextTop();
    this.cursorOffsetCache = {};
    this.renderCursorOrSelection();
    if(this.group){
      this.group._transformDone = true;
    }
  }

  runCharRendering(method: any, ctx: CanvasRenderingContext2D, _char: string, left: number, top: number, angle: number, fullDecl: any, alignment: any) {
    if(ctx){
      ctx.save();
      ctx.translate(left, top)
      ctx.rotate(angle)
    }
    for(let i in this.textRenders){
      // @ts-ignore
      let result = this[this.textRenders[i]](method, ctx, _char, fullDecl, alignment, left, top, angle)
      if (result === true) break;
    }
    if(ctx) {
      ctx.restore()
    }
  }

  getSelectionStartFromPointer(e: TPointerEvent): number {
    const mouseOffset = this.canvas!.getPointer(e)
      .transform(util.invertTransform(this.calcTransformMatrix()))
      .add(new Point(-this._getLeftOffset(), -this._getTopOffset()));

    let relX = mouseOffset.x + (-this.width / 2 + this._contentOffsetX) * this.scaleX,
      relY = mouseOffset.y + (-this.height / 2 - this._curvingCenter.y + this._contentOffsetY) * this.scaleY,
      angle = Math.atan2(-relX, -relY),
      radius = Math.sqrt(relX * relX + relY * relY) / this.scaleY,
      selectedLine = 0;

    if (this.curvature > 0) {
      while (radius < this._linesRads[selectedLine]) {
        selectedLine++;
      }
    } else {
      if (angle < 0) angle += Math.PI * 2
      while (radius > this._linesRads[selectedLine]) {
        selectedLine++;
      }
    }
    if(selectedLine >= this._textLines.length){
      selectedLine = this._textLines.length - 1
    }

    let charIndex = 0;
    for (let i = 0; i < selectedLine; i++) {
      charIndex += this._textLines[i].length + this.missingNewlineOffset(i);
    }

    let specials = this._specialArray && this._specialArray[selectedLine]
    let specialsLen = 0;
    let diff = Infinity, diff2, j
    for (j = 0; j < this._charTransformations[selectedLine].length; j++) {
      if (specials && specials[j] && specials[j] === specials[j - 1] || this._charTransformations[selectedLine][j].isDiacritic) {
        specialsLen++
        continue;
      }
      diff2 = Math.abs(this._charTransformations[selectedLine][j].leftAngle - angle) % (Math.PI * 2)
      if (diff < diff2) {
        let result = charIndex + j - 1 - specialsLen
        specialsLen = 0;
        return result;
      }
      diff = diff2
      specialsLen = 0;
    }
    return charIndex + j - 1;
  }

   _getArcTextLineLeftOffset(lineIndex: number, width: number): number {
    if (!width) return 0;
    let lineWidth = this.getLineWidth(lineIndex);
    if (this.textAlign === 'center') return (width - lineWidth) / 2;
    if (this.textAlign === 'right') return width - lineWidth;
    if (this.textAlign === 'justify-center' && this.isEndOfWrapping(lineIndex)) return (width - lineWidth) / 2;
    if (this.textAlign === 'justify-right' && this.isEndOfWrapping(lineIndex)) return width - lineWidth;
    return 0;
  }

  _renderTextDecoration(ctx: CanvasRenderingContext2D, type: any) {
    if (!this.get(type) && !this.styleHas(type)) {
      return;
    }
    let currentFill, _size, size, dy, _dy, lastFill, line, lastDecoration, charStart, currentDecoration;
    ctx.save()
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      if (!this.type && !this.styleHas(type, i)) {
        continue;
      }
      charStart = 0
      lastDecoration = this.getValueOfPropertyAt(i, 0, type);
      lastFill = this.getValueOfPropertyAt(i, 0, 'fill');
      size = this.getHeightOfChar(i, 0);
      dy = this.getValueOfPropertyAt(i, 0, 'deltaY');
      let j;
      for (j = 0; j < this._textLines[i].length; j++) {
        currentDecoration = this.getValueOfPropertyAt(i, j, type);
        currentFill = this.getValueOfPropertyAt(i, j, 'fill');
        _size = this.getHeightOfChar(i, j);
        _dy = this.getValueOfPropertyAt(i, j, 'deltaY');

        if (currentDecoration !== lastDecoration || currentFill !== lastFill || _size !== size || _dy !== dy) {

          if (lastDecoration && lastFill) {
            // @ts-ignore
            let offset = this.offsets[type] as any * size + dy
            this._drawTextLinesDecorationSector(ctx, lastFill, offset, i, charStart, j)
          }

          lastDecoration = currentDecoration;
          lastFill = currentFill;
          size = _size;
          dy = _dy;
          charStart = j;
        }
      }
      if (currentDecoration && currentFill) {
        // @ts-ignore
        let offset = this.offsets[type] * size + dy
        this._drawTextLinesDecorationSector(ctx, currentFill, offset, i, charStart, j)
      }
    }
    ctx.restore()
    this._removeShadow(ctx);
  }
  
  enArcLargeSpaces(width: number) {
    let diffSpace, currentLineWidth, numberOfSpaces, accumulatedSpace, line, charBound, spaces;
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      if (this.textAlign !== 'justify' && (i === len - 1 || this.isEndOfWrapping(i))) {
        continue;
      }
      accumulatedSpace = 0;
      line = this._textLines[i];
      currentLineWidth = this.getLineWidth(i);
      if (currentLineWidth < width && (spaces = this.textLines[i].match(this._reSpacesAndTabs))) {
        numberOfSpaces = spaces.length;
        diffSpace = (width - currentLineWidth) / numberOfSpaces;
        for (let j = 0, jlen = line.length; j <= jlen; j++) {
          charBound = this.__charBounds[i][j];
          if (this._reSpaceAndTab.test(line[j])) {
            charBound.width += diffSpace;
            charBound.kernedWidth += diffSpace;
            charBound.left += accumulatedSpace;
            accumulatedSpace += diffSpace;
          } else {
            charBound.left += accumulatedSpace;
          }
        }
      }
    }
  }

  _getBaseLine(styleFontSize = 1) {
    return (this.lineHeight * this.fontSize) -0.9 * styleFontSize
  }

  _translate(leftOverflow: number, topOverflow: number){
    let rad = util.degreesToRadians(this.angle);
    this.top -= (topOverflow - this._translatedY) * Math.cos(rad) *  this.scaleY;
    this.left += (topOverflow - this._translatedY)  * Math.sin(rad)* this.scaleY;
    this.top -= (leftOverflow - this._translatedX) * Math.sin(rad) *  this.scaleX;
    this.left -= (leftOverflow - this._translatedX)  * Math.cos(rad)* this.scaleX;
    this._translatedY = topOverflow
    this._translatedX = leftOverflow
  }

  initDimensions() {
    this._splitText();
    this._clearCache();
    for (let li = 0, len = this._textLines.length; li < len; li++) {
      this.getLineWidth(li);
      this.getHeightOfLine(li);
    }
    let textHeight = this.calcTextHeight();
    let textWidth = this.calcTextWidth();
    this.radius = 10000 / (this.curvature || 1)

    let cx = 0, cy = this.curvature > 0 ? textHeight / 2 + this.radius : -textHeight / 2 + this.radius
    this._curvingCenter = {x: cx, y: cy}

    let globalOffset = 0
    if (this.curvature > 0) {
      globalOffset = textHeight
    } 
    this._linesRads = []

    if (this.textAlign.indexOf('justify') !== -1) {
      this.enArcLargeSpaces(textWidth);
    }

    //calculate curving

    let cts: any[] = this._charTransformations = []

    let yMin = Infinity, yMax = -Infinity, xMin = Infinity, xMax = -Infinity

    for(let i = 0; i < this.__charBounds.length; i++) {
      cts[i] = []
      let row = this.__charBounds[i]

      let currentLeft = -textWidth / 2 + this._getArcTextLineLeftOffset(i, textWidth)

      if (this.__lineInfo) {
        currentLeft += this.__lineInfo[i].renderedLeft
      }

      let heightOfLine = this.getHeightOfLine(i);
      let charOffset = (heightOfLine - heightOfLine / this.lineHeight) + heightOfLine * this._fontSizeFraction / this.lineHeight

      if (this.curvature > 0) {
        globalOffset -= heightOfLine
      } else {
        globalOffset += heightOfLine
      }
      let rowOffset = Math.abs(this.radius) + globalOffset;

      this._linesRads.push(rowOffset)

      for (let j = 0; j < row.length; j++) {
        let bounds = row[j] as any
        let decl = this.getCompleteStyleDeclaration(i, j) as any;
        let deltaY = decl && decl.deltaY || 0

        let bottomRadius, topRadius, charRadius, lineRadius, leftAngle, charAngle, rightAngle, renderLeftAngle, renderRightAngle;

        if (this.curvature > 0) {
          bottomRadius = deltaY + rowOffset
          topRadius = deltaY + rowOffset + heightOfLine
          charRadius = deltaY + rowOffset + charOffset
          lineRadius = deltaY + rowOffset + heightOfLine - (heightOfLine / this.lineHeight)

          let midRadius = (bottomRadius * 3 + topRadius * 2) / 5
          leftAngle = -(currentLeft + bounds.left) / midRadius
          rightAngle = -(currentLeft + bounds.left + bounds.width) / midRadius
          charAngle = -(currentLeft + bounds.left + bounds.width / 2) / midRadius

        } else {
          bottomRadius = deltaY + rowOffset
          topRadius = deltaY + rowOffset - heightOfLine
          charRadius = deltaY + rowOffset - charOffset
          lineRadius = deltaY + rowOffset - heightOfLine + (heightOfLine / this.lineHeight)

          let midRadius = (bottomRadius * 2 + topRadius * 3) / 5
          leftAngle = Math.PI + (currentLeft + bounds.left) / midRadius
          rightAngle = Math.PI + (currentLeft + bounds.left + bounds.width) / midRadius
          charAngle = Math.PI + (currentLeft + bounds.left + bounds.width / 2) / midRadius
        }

        let rsin = Math.sin(rightAngle),
          rcos = Math.cos(rightAngle),
          lsin = Math.sin(leftAngle),
          lcos = Math.cos(leftAngle),
          csin = Math.sin(charAngle),
          ccos = Math.cos(charAngle)

        let ct = {
          contour: bounds.contour && {
            x: bounds.contour.x * decl.fontSize,
            w: bounds.contour.w * decl.fontSize,
            h: bounds.contour.h * decl.fontSize,
            y: this._getBaseLine(decl.fontSize) + bounds.contour.y * decl.fontSize!
          },
          char: this._textLines[i][j],
          charAngle,
          leftAngle,
          rightAngle,
          charRadius,
          bottomRadius,
          topRadius,
          lineRadius,
          renderLeftAngle,
          renderRightAngle,
          bl: {x: cx - bottomRadius * lsin, y: cy - bottomRadius * lcos},
          br: {x: cx - bottomRadius * rsin, y: cy - bottomRadius * rcos},
          tl: {x: cx - topRadius * lsin, y: cy - topRadius * lcos},
          tr: {x: cx - topRadius * rsin, y: cy - topRadius * rcos},
          nl: {x: cx - lineRadius * lsin, y: cy - lineRadius * lcos},
          nr: {x: cx - lineRadius * rsin, y: cy - lineRadius * rcos},
          cl: {x: cx - charRadius * csin, y: cy - charRadius * ccos},
          lc: {x: cx - lineRadius * csin, y: cy - lineRadius * ccos}
        }

        if(ct.char?.trim() && bounds.contour) {
          let cos = util.cos(-charAngle), sin = util.sin(-charAngle);

          let rotateMatrix = [cos, sin, -sin, cos, 0, 0]
          let matrix = util.multiplyTransformMatrices([1, 0, 0, 1, ct.lc.x, ct.lc.y], rotateMatrix as TMat2D);
          let y = ct.contour.y
          if (this.curvature > 0) {
            let x = ct.contour.x - this.__charBounds[i][j].width / 2
            ct.contour.br = util.transformPoint({x: x + ct.contour.w, y: -y}, matrix);
            ct.contour.bl = util.transformPoint({x: x, y: -y}, matrix);
            ct.contour.tl = util.transformPoint({x: x, y: -y - ct.contour.h}, matrix);
            ct.contour.tr = util.transformPoint({x: x + ct.contour.w, y: -y - ct.contour.h}, matrix);
          } else {
            let x = - ct.contour.x + this.__charBounds[i][j].width / 2

            ct.contour.br = util.transformPoint({x: x - ct.contour.w, y: y}, matrix);
            ct.contour.bl = util.transformPoint({x: x, y: y}, matrix);
            ct.contour.tl = util.transformPoint({x: x, y: y + ct.contour.h}, matrix);
            ct.contour.tr = util.transformPoint({x: x - ct.contour.w, y: y + ct.contour.h}, matrix);
          }
          xMin = Math.min(xMin, ct.contour.br.x, ct.contour.bl.x, ct.contour.tl.x, ct.contour.tr.x)
          xMax = Math.max(xMax, ct.contour.br.x, ct.contour.bl.x, ct.contour.tl.x, ct.contour.tr.x)
          yMin = Math.min(yMin, ct.contour.br.y, ct.contour.bl.y, ct.contour.tl.y, ct.contour.tr.y)
          yMax = Math.max(yMax, ct.contour.br.y, ct.contour.bl.y, ct.contour.tl.y, ct.contour.tr.y)

        }

        cts[i][j] = ct
      }
    }
    for(let i = 0; i< cts.length; i++) {
      let ctsl = cts[i] as any, cta = ctsl[0], ctb = ctsl[ctsl.length - 1], bbox, bbox2

      if (this.curvature > 0) {
        bbox = sectorBoundingBox(cta.tl, ctb.tr, this._curvingCenter, this._linesRads[i] + this.__lineHeights[i])
        bbox2 = sectorBoundingBox(cta.nl, ctb.nr, this._curvingCenter, this._linesRads[i])
      }
      else{
        bbox = sectorBoundingBox(ctb.tr, cta.tl, this._curvingCenter, this._linesRads[i] - this.__lineHeights[i])
        bbox2 = sectorBoundingBox(ctb.nr, cta.nl, this._curvingCenter, this._linesRads[i])
      }

      xMin = Math.min(xMin, bbox.x, bbox2.x)
      xMax = Math.max(xMax, bbox.x+ bbox.width, bbox2.x + bbox2.width)
      yMin = Math.min(yMin, bbox.y, bbox2.y)
      yMax = Math.max(yMax, bbox.y+bbox.height, bbox2.y + bbox2.height)
    }

    this._enableFontFeatures()
    this._enableDiacritics()

    let leftOverflow = -xMin - textWidth / 2
    let rightOverflow = xMax - textWidth / 2
    let topOverflow = -yMin - textHeight / 2
    let bottomOverflow = yMax - textHeight / 2

    this.width = Math.max(textWidth + leftOverflow + rightOverflow, this.MIN_TEXT_WIDTH)
    this.height = textHeight + topOverflow + bottomOverflow
    this._contentOffsetY = bottomOverflow / 2 - topOverflow / 2
    this._contentOffsetX = rightOverflow / 2 - leftOverflow / 2

    let _translateX = this.originX === "left" ? leftOverflow : this._contentOffsetX;

    this._translate(_translateX, topOverflow)
    this.updateCurvingControl()
    console.log('updateCurvingControl:', 'this:', this)
  }

  _hasStyleChanged (prevStyle: string[], thisStyle: string[]) {
    if(Object.keys(prevStyle).length !== Object.keys(thisStyle).length ){
      return true
    }
    for(let prop in prevStyle){
      if(prevStyle[prop] !== thisStyle[prop]){
        return true;
      }
    }
    return false;
  }

  interateTextChunks(lineIndex: number, foo: Function, iteratorFn?: Function){
    let actualStyle: any, nextStyle, firstChar = 0;
    let specs = this._specialArray
    let line = this._textLines[lineIndex]
    let isJustify = this.textAlign.indexOf('justify') !== -1;
    let shortCut = !isJustify && this.charSpacing === 0 && (!specs || !specs[lineIndex]) && this.isEmptyStyles(lineIndex);

    if (shortCut) {
      foo(0, line.length, null)
      return;
    }

    let timeToRender;

    for (let i = 0, len = line.length - 1; i <= len; i++) {
      timeToRender = i === len || this.charSpacing;
      iteratorFn && iteratorFn(i)
      if (isJustify && !timeToRender) {
        if (this._reSpaceAndTab.test(line[i])) {
          timeToRender = true;
        }
      }
      if (!timeToRender) {
        actualStyle = actualStyle || this.getCompleteStyleDeclaration(lineIndex, i);
        nextStyle = this.getCompleteStyleDeclaration(lineIndex, i + 1) as any;

        timeToRender = (specs && specs[lineIndex] && specs[lineIndex][i] !== specs[lineIndex][i + 1]) || this._hasStyleChanged(actualStyle, nextStyle)
      }

      if (timeToRender) {
        foo(firstChar, i, actualStyle)
        firstChar = i + 1;
        actualStyle = nextStyle;
      }
    }
  }

  _enableFontFeatures(){
    let detectedFeaturesLines: any = []
    for (let li = 0, len = this._textLines.length; li < len; li++) {
      detectedFeaturesLines[li] = []
      this.interateTextChunks(li, (position: number, b: number, style: any) => {
        let components = this._textLines[li].slice(position,b+1)
        if (this._specialArray?.[li]?.[position]) {
          detectedFeaturesLines[li].push({components,position})
        } else {
          let ff = style?.fontFamily || this?.styles[li]?.[position]?.fontFamily || this.fontFamily;
          console.log('ff:', ff)
          // let detected = fabric.fonts.getTextFeatures(components.join(""), ff, this.features)
          // for (let detectedInstance of detected) {
          //   detectedInstance.position += position
          //   detectedFeaturesLines[li].push(detectedInstance)
          // }
        }
      })
    }
    let cts = this._charTransformations
    for (let li in detectedFeaturesLines) {
      for (let feature of detectedFeaturesLines[li]) {
        let first = cts[li][feature.position];
        let last = cts[li][feature.position + feature.components.length - 1]
        first.char = feature.components
        first.charAngle = (first.charAngle + last.charAngle) / 2
        let midAngle = (first.leftAngle + last.rightAngle) / 2
        first.cl = {x: this._curvingCenter.cx - first.charRadius * Math.sin(midAngle), y: this._curvingCenter.cy - first.charRadius * Math.cos(midAngle)};
        for (let fci = 1; fci < feature.components.length; fci++) {
          delete cts[li][feature.position + fci].char
        }
      }
    }
  }

  _enableDiacritics(){
    let cts = this._charTransformations
    //Fix Diacritics symbols on a curve
    let diacritics = ['́', '̀', '̂', '̌', '̋', '̏', '̃', '̇', '̣', '·', '̈', 'ː', '̆', '̑', '͗', '̃', '҃', '̩', '̄', '̱', '⃓', '̷', '̵', '̊', '̓', '̒', '̔', '̉', '̛', '̦', '̧', '̡', '̢', '̨', '͝', '͡', '', '͞', '͠']
    for (let i in cts) {
      for (let j in cts[i]) {
        if (cts[i][j].char && diacritics.includes(cts[i][j].char)) {
          // @ts-ignore
          for (let k = j; k--;) {
            if (cts[i][k].char) {
              cts[i][k].char += cts[i][j].char
              cts[i][j].isDiacritic = true;
              delete cts[i][j].char
              break;
            }
          }
        }
      }
    }
  }

  _drawTextLinesDecorationSector(ctx: CanvasRenderingContext2D, currentColor: string, offset: number, line: number, charStart: number, charEnd: number) {
    ctx.fillStyle = currentColor;
    ctx.lineWidth = this.fontSize / 15
    let startChar = this._charTransformations[line][charStart]
    let endChar = this._charTransformations[line][charEnd - 1]
    ctx.beginPath()
    if (this.curvature < 0) {
      ctx.arc(this._curvingCenter.x, this._curvingCenter.y, startChar.charRadius + 1 + offset, -startChar.leftAngle - Math.PI / 2, -endChar.rightAngle - Math.PI / 2, true)
    } else {
      ctx.arc(this._curvingCenter.x, this._curvingCenter.y, startChar.charRadius - 1 - offset, -startChar.leftAngle - Math.PI / 2, -endChar.rightAngle - Math.PI / 2, false)
    }
    ctx.stroke()
  }

  _contextSelectBackgroundSector(ctx: CanvasRenderingContext2D, line: number, charStart: number, charEnd: number, fullLineRadius?: boolean) {
    ctx.beginPath()
    let startChar = this._charTransformations[line][charStart];
    let endChar = this._charTransformations[line][charEnd];
    ctx.moveTo(startChar.tl.x, startChar.tl.y)
    let radius = fullLineRadius ? startChar.bottomRadius : startChar.lineRadius
    if (this.curvature < 0) {
      ctx.arc(this._curvingCenter.x, this._curvingCenter.y, radius, -startChar.leftAngle - Math.PI / 2, -endChar.rightAngle - Math.PI / 2, true)
    } 
    else {
      ctx.arc(this._curvingCenter.x, this._curvingCenter.y, radius, -startChar.leftAngle - Math.PI / 2, -endChar.rightAngle - Math.PI / 2, false)
    }
    ctx.lineTo(endChar.tr.x, endChar.tr.y)
    if (this.curvature < 0) {
      ctx.arc(this._curvingCenter.x, this._curvingCenter.y, startChar.topRadius, -endChar.rightAngle - Math.PI / 2, -startChar.leftAngle - Math.PI / 2, false)
    } 
    else {
      ctx.arc(this._curvingCenter.x, this._curvingCenter.y, startChar.topRadius, -endChar.rightAngle - Math.PI / 2, -startChar.leftAngle - Math.PI / 2, true)
    }
    ctx.closePath()
  }

  _renderTextLinesBackground(ctx: CanvasRenderingContext2D) {
    if (!this.textBackgroundColor && !this.styleHas('textBackgroundColor')) return;
    let originalFill = ctx.fillStyle, lastColor, charStart, currentColor;
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      if (!this.textBackgroundColor && !this.styleHas('textBackgroundColor', i)) {
        continue;
      }
      charStart = 0
      lastColor = this.getValueOfPropertyAt(i, 0, 'textBackgroundColor');
      let j = 0
      for (j = 0; j < this._textLines[i].length; j++) {
        currentColor = this.getValueOfPropertyAt(i, j, 'textBackgroundColor');
        if (currentColor !== lastColor) {
          if (lastColor) {
            ctx.fillStyle = lastColor;
            this._contextSelectBackgroundSector(ctx, i, charStart, j - 1)
            ctx.fill()
          }
          charStart = j;
          lastColor = currentColor;
        }
      }
      if (currentColor) {
        ctx.fillStyle = currentColor;
        this._contextSelectBackgroundSector(ctx, i, charStart, j - 1)
        ctx.fill()
      }
    }
    ctx.fillStyle = originalFill;
    this._removeShadow(ctx);
  }

  _set(key: string, value: any): any {
    super._set(key, value)
    const _dimensionAffectingProps = ['fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'lineHeight', 'text', 'charSpacing', 'textAlign', 'styles', 'left', 'top', 'fill']
    let needsDims = false;
    if (typeof key === 'object') {
      const keys = key as Object
      for (let _key in keys) {
        needsDims = needsDims || _dimensionAffectingProps.indexOf(_key) !== -1;
      }
    } else {
      needsDims = _dimensionAffectingProps.indexOf(key) !== -1;
    }
    if (needsDims && this.initialized) {
      this.initDimensions();
      this.setCoords();
    }
    return this;
  }

  // _render(ctx: CanvasRenderingContext2D) {
  //   console.log('render:', this)
  //   ctx.save()
  //   ctx.translate(-this._contentOffsetX, -this._contentOffsetY)
  //   if(!this.__lineHeights){
  //     this.initDimensions();
  //   }
  //   this._setTextStyles(ctx);
  //   this._renderTextLinesBackground(ctx);
  //   this._renderTextDecoration(ctx, 'underline');
  //   this._renderText(ctx);
  //   this._renderTextDecoration(ctx, 'overline');
  //   this._renderTextDecoration(ctx, 'linethrough');
  //   ctx.restore()
  // }

  renderSelection(ctx: CanvasRenderingContext2D, boundaries: any) {
    let selectionStart = this.inCompositionMode ? this.hiddenTextarea!.selectionStart : this.selectionStart,
      selectionEnd = this.inCompositionMode ? this.hiddenTextarea!.selectionEnd : this.selectionEnd,
      start = this.get2DCursorLocation(selectionStart),
      end = this.get2DCursorLocation(selectionEnd),
      startLine = start.lineIndex,
      endLine = end.lineIndex,
      startChar = start.charIndex < 0 ? 0 : start.charIndex,
      endChar = end.charIndex < 0 ? 0 : end.charIndex;

    ctx.fillStyle = this.selectionColor;
    ctx.translate(-this._contentOffsetX, -this._contentOffsetY)

    for (let i = startLine; i <= endLine; i++) {
      let charStart = (i === startLine) ? startChar : 0,
        charEnd = (i >= startLine && i < endLine) ? this._textLines[i].length : endChar
      this._contextSelectBackgroundSector(ctx, i, charStart, charEnd - 1, i !== endLine)
      ctx.fill();
    }
  }

  renderCursor(ctx: CanvasRenderingContext2D, boundaries: any) {
    let cursorLocation = this.get2DCursorLocation(),
      lineIndex = cursorLocation.lineIndex,
      charIndex = cursorLocation.charIndex > 0 ? cursorLocation.charIndex - 1 : 0,
      multiplier = this.scaleX * this.canvas!.getZoom(),
      cursorWidth = this.cursorWidth / multiplier;

    if (this.inCompositionMode) {
      this.renderSelection(boundaries, ctx);
    }

    let tr = this._charTransformations[cursorLocation.lineIndex][cursorLocation.charIndex];

    ctx.save();
    ctx.translate(-this._contentOffsetX, -this._contentOffsetY)
    ctx.lineWidth = cursorWidth
    ctx.strokeStyle = this.getValueOfPropertyAt(lineIndex, charIndex, 'fill');
    ctx.globalAlpha = this.__isMousedown ? 1 : this._currentCursorOpacity;

    ctx.beginPath()
    ctx.moveTo(tr.nl.x, tr.nl.y)
    ctx.lineTo(tr.tl.x, tr.tl.y)
    ctx.stroke();
    ctx.restore();
  }
}

Object.assign(ArcText.prototype, {
  _translatedY: 0,
  _translatedX: 0,
  _translate(leftOverflow, topOverflow) {
    let rad = util.degreesToRadians(this.angle);
    this.top -= (topOverflow - this._translatedY) * Math.cos(rad) *  this.scaleY;
    this.left += (topOverflow - this._translatedY)  * Math.sin(rad)* this.scaleY;
    this.top -= (leftOverflow - this._translatedX) * Math.sin(rad) *  this.scaleX;
    this.left -= (leftOverflow - this._translatedX)  * Math.cos(rad)* this.scaleX;
    this._translatedY = topOverflow
    this._translatedX = leftOverflow
  }
})

Object.assign(ArcText.prototype, ArcTextMixin, {
  /**
   * @private
   * @param {Object} prevStyle
   * @param {Object} thisStyle
   */
  _hasStyleChanged(prevStyle: any, thisStyle: any) {
    if(Object.keys(prevStyle).length !== Object.keys(thisStyle).length ){
      return true
    }
    for(let prop in prevStyle){
      if(prevStyle[prop] !== thisStyle[prop]){
        return true;
      }
    }
    return false;
  },

  calcTextHeight() {
    let lineHeight, height = 0;
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      lineHeight = this.getHeightOfLine(i);
      height += (i === len - 1 ? lineHeight / this.lineHeight : lineHeight);
    }
    return height;
  },

  _renderTextDecoration(ctx: CanvasRenderingContext2D, type: any) {
    if (!this[type] && !this.styleHas(type)) {
      return;
    }
    let heightOfLine, size, _size,
      lineLeftOffset, dy, _dy,
      line, lastDecoration,
      leftOffset = this._getLeftOffset(),
      topOffset = this._getTopOffset(), top,
      boxStart, boxWidth, charBox, currentDecoration,
      maxHeight, currentFill, lastFill,
      charSpacing = this._getWidthOfCharSpacing();

    for (let i = 0, len = this._textLines.length; i < len; i++) {
      heightOfLine = this.getHeightOfLine(i);
      if (!this[type] && !this.styleHas(type, i)) {
        topOffset += heightOfLine;
        continue;
      }
      line = this._textLines[i];
      maxHeight = heightOfLine / this.lineHeight;
      lineLeftOffset = this._getLineLeftOffset(i);
      if(this.__lineInfo  && this.__lineInfo[i]){
        lineLeftOffset += this.__lineInfo[i].renderedLeft
      }
      boxStart = 0;
      boxWidth = 0;
      lastDecoration = this.getValueOfPropertyAt(i, 0, type);
      lastFill = this.getValueOfPropertyAt(i, 0, 'fill');
      top = topOffset + maxHeight * (1 - this._fontSizeFraction);
      size = this.getHeightOfChar(i, 0);
      dy = this.getValueOfPropertyAt(i, 0, 'deltaY');
      for (let j = 0, jlen = line.length; j < jlen; j++) {
        charBox = this.__charBounds[i][j];
        currentDecoration = this.getValueOfPropertyAt(i, j, type);
        currentFill = this.getValueOfPropertyAt(i, j, 'fill');
        _size = this.getHeightOfChar(i, j);
        _dy = this.getValueOfPropertyAt(i, j, 'deltaY');
        if ((currentDecoration !== lastDecoration || currentFill !== lastFill || _size !== size || _dy !== dy) &&
          boxWidth > 0) {
          ctx.fillStyle = lastFill;
          lastDecoration && lastFill && ctx.fillRect(
            leftOffset + lineLeftOffset + boxStart,
            top + this.offsets[type] * size + dy,
            boxWidth,
            this.fontSize / 15
          );
          boxStart = charBox.left;
          boxWidth = charBox.width;
          lastDecoration = currentDecoration;
          lastFill = currentFill;
          size = _size;
          dy = _dy;
        }
        else {
          boxWidth += charBox.kernedWidth;
        }
      }
      ctx.fillStyle = currentFill;
      currentDecoration && currentFill && ctx.fillRect(
        leftOffset + lineLeftOffset + boxStart,
        top + this.offsets[type] * size + dy,
        boxWidth - charSpacing,
        this.fontSize / 15
      );
      topOffset += heightOfLine;
    }
    this._removeShadow(ctx);
  },
  _renderTextLinesBackground(ctx: CanvasRenderingContext2D) {
    if (!this.textBackgroundColor && !this.styleHas('textBackgroundColor')) {
      return;
    }
    let lineTopOffset = 0, heightOfLine,
      lineLeftOffset, originalFill = ctx.fillStyle,
      line, lastColor,
      leftOffset = this._getLeftOffset(),
      topOffset = this._getTopOffset(),
      boxStart = 0, boxWidth = 0, charBox, currentColor;

    for (let i = 0, len = this._textLines.length; i < len; i++) {
      heightOfLine = this.getHeightOfLine(i);
      if (!this.textBackgroundColor && !this.styleHas('textBackgroundColor', i)) {
        lineTopOffset += heightOfLine;
        continue;
      }
      line = this._textLines[i];
      lineLeftOffset = this._getLineLeftOffset(i);

      if(this.__lineInfo  && this.__lineInfo[i]){
        lineLeftOffset += this.__lineInfo[i].renderedLeft
      }
      boxWidth = 0;
      boxStart = 0;
      lastColor = this.getValueOfPropertyAt(i, 0, 'textBackgroundColor');
      for (let j = 0, jlen = line.length; j < jlen; j++) {
        charBox = this.__charBounds[i][j];
        currentColor = this.getValueOfPropertyAt(i, j, 'textBackgroundColor');
        if (currentColor !== lastColor) {
          ctx.fillStyle = lastColor;

          lastColor && ctx.fillRect(
            leftOffset + lineLeftOffset + boxStart,
            topOffset + lineTopOffset,
            boxWidth,
            heightOfLine / this.lineHeight
          );
          boxStart = charBox.left;
          boxWidth = charBox.width;
          lastColor = currentColor;
        }
        else {
          boxWidth += charBox.kernedWidth;
        }
      }
      if (currentColor) {
        ctx.fillStyle = currentColor;
        ctx.fillRect(
          leftOffset + lineLeftOffset + boxStart,
          topOffset + lineTopOffset,
          boxWidth,
          heightOfLine / this.lineHeight
        );
      }
      lineTopOffset += heightOfLine;
    }
    ctx.fillStyle = originalFill;
    this._removeShadow(ctx);
  },

  getLineWidth(lineIndex: number) {
    if (this.__lineWidths[lineIndex]) {
      return this.__lineWidths[lineIndex];
    }
    let width, line = this._textLines[lineIndex], lineInfo;
    if (line === '') {
      width = 0;
    }
    else {
      lineInfo = this.measureLine(lineIndex);
      if(this.useRenderBoundingBoxes){
        width = lineInfo.width + lineInfo.renderedRight + lineInfo.renderedLeft
        this.__lineInfo[lineIndex] = lineInfo
      }
      else{
        width = lineInfo.width;
      }
    }
    this.__lineWidths[lineIndex] = width;
    return width;
  },

  initDimensions() {
    if (!this.initDimensions) return
    this._splitText();
    this._clearCache();

    this.width = this.calcTextWidth() || this.cursorWidth || this.MIN_TEXT_WIDTH;

    if (this.textAlign.indexOf('justify') !== -1) {
      this.enlargeSpaces();
    }
    this.height = this.calcTextHeight();
    if(this.useRenderBoundingBoxes){
      let lf = this.__lineInfo
      this.__renderOffsetTop = isFinite(lf[0].renderedTop) ? this.__lineHeights[0] / this.lineHeight - lf[0].renderedTop : 0
      let paddingBottom = isFinite(lf[lf.length - 1].renderedBottom) ? lf[lf.length - 1].renderedBottom: 0;
      this.height += paddingBottom - this.__renderOffsetTop
      this._translate(0,-this.__renderOffsetTop)
    }
  },
  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {String} method Method name ("fillText" or "strokeText")
   */
  _renderTextCommon(ctx: CanvasRenderingContext2D, method: string) {
    ctx && ctx.save();
    let lineHeights = 0, left = this._getLeftOffset(), top = this._getTopOffset(),
      offsets = this._applyPatternGradientTransform(ctx, method === 'fillText' ? this.fill : this.stroke);
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      let lineOffsetX = 0
      let lineOffsetY = 0
      if(this.__lineInfo && this.__lineInfo[i]) {
        lineOffsetX = this.__lineInfo[i].renderedLeft
        lineOffsetY = this.__renderOffsetTop
      }
      let heightOfLine = this.getHeightOfLine(i),
        maxHeight = heightOfLine / this.lineHeight,
        leftOffset = this._getLineLeftOffset(i);
      this._renderTextLine(
        method,
        ctx,
        this._textLines[i],
        left + leftOffset - offsets.offsetX + lineOffsetX,
        top + lineHeights + maxHeight - offsets.offsetY- lineOffsetY,
        i
      );
      lineHeights += heightOfLine;
    }
    ctx && ctx.restore();
  },
  //add textTransform support
  _splitText() {
    let text= this.text
    if(this.textTransform){
      if(this.textTransform === "uppercase"){
        text = text.toUpperCase()
      }
      if(this.textTransform === "lowercase"){
        text = text.toLowerCase()
      }
      if(this.textTransform === "capitalize"){
        text = util.string.capitalize(text)
      }
    }
    let newLines = this._splitTextIntoLines(text);
    this.textLines = newLines.lines;
    this._textLines = newLines.graphemeLines;
    this._unwrappedTextLines = newLines._unwrappedLines;
    this._text = newLines.graphemeText;

    if(this.useRenderBoundingBoxes){
      this.__lineInfo = []
    }
    return newLines;
  },

  setTextTransform(value: any) {
    this.textTransform = value
    this.setText(this.text)
    this.dirty = true
    this.initDimensions()
    this.canvas && this.canvas.requestRenderAll()
  },
  "+_dimensionAffectingProps": ["textTransform"],
  "+cacheProperties": ["textTransform"],
  "+stateProperties": ["textTransform"],
  textTransform: false,
  useBothRenderingMethod: true,
  renderCharCallback: null,
  textRenders: ["defaultTextRender"],
  accepts: { role: "fontFamily" },
  storeProperties: ["type", "clipPath","frame","deco",'textLines','textTransform'],
  eventListeners: {},
  textCase: "none",
  isText: true,
  fontSizeOptions: [6,7,8,9,10,12,14,18,24,36,48,64],
  features: {
    "dnom": false, // Denominators Mostly superceded by contextual <frac> implementations
    "numr": false, // Numerators Mostly superceded by contextual <frac> implementations
    "frac": false, // Fractions
    "zero": false, // Slashed Zero
    "calt": true,  // Contextual Alternates
    "liga": true,  // Standard Ligatures
    "ccmp": true,  // Glyph Composition / Decomposition
    "dlig": false, // Discretionary Ligatures
    "rlig": false, // Requiered Ligatures

    "c2sc": false, // Small Capitals From Capitals
    "smcp": false, // Small Capitals from lowercase
    "unic": false, // Unicase

    "lnum": false, // Lining Figures
    "onum": false, // Oldstyle Figures
    "pnum": false, // Proportional Figures
    "tnum": false,  // Tabular Figures
    "locl": false, // Localized Forms

    "ss01": false, // Stylistic Set 01
    "ss02": false, // Stylistic Set 02
    "ss03": false, // Stylistic Set 03
    "ss04": false, // Stylistic Set 04
    "ss05": false, // Stylistic Set 05
    "ss06": false, // Stylistic Set 06
    "ss07": false, // Stylistic Set 07

    "cpsp": false,  // Capital Spacing
    "kern": false,  // Kerning

    "mark": false,  //Mark positioning
    "mkmk": false,  //Mark to mark positioning
  },

  /**
   * @private
   */
  _wrapSVGTextAndBg(textAndBg: any) {
    let noShadow = true, textDecoration = this.getSvgTextDecoration(this);
    return [
      textAndBg.textBgRects.join(''),
      '\t\t<text xml:space="preserve" ',
      (this.fontFamily ? 'font-family="\'' + this.fontFamily.replace(/"/g, '\'') + '\'" ' : ''),
      (this.fontSize ? 'font-size="' + this.fontSize + '" ' : ''),
      (this.fontStyle ? 'font-style="' + this.fontStyle + '" ' : ''),
      (this.fontWeight ? 'font-weight="' + this.fontWeight + '" ' : ''),
      (textDecoration ? 'text-decoration="' + textDecoration + '" ' : ''),
      'style="', this.getSvgStyles(noShadow), '"', this.addPaintOrder(), ' >',
      textAndBg.textSpans.join(''),
      '</text>\n',
      textAndBg.special ? textAndBg.special.join('') : ''
    ];
  },
  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _renderText(ctx: CanvasRenderingContext2D) {
    if(this.useBothRenderingMethod){
      return this._renderTextCommon(ctx, 'both');
    }
    if (this.paintFirst === 'stroke') {
      this._renderTextStroke(ctx);
      this._renderTextFill(ctx);
    }
    else {
      this._renderTextFill(ctx);
      this._renderTextStroke(ctx);
    }
  },
  
  interateTextChunks(lineIndex: number, foo: Function, iteratorFn: Function){
    let actualStyle,
      nextStyle,
      firstChar = 0;
    let specs = this._specialArray
    let line = this._textLines[lineIndex]
    let isJustify = this.textAlign.indexOf('justify') !== -1;
    let shortCut = !isJustify && this.charSpacing === 0 && (!specs || !specs[lineIndex]) && this.isEmptyStyles(lineIndex);

    if (shortCut) {
      // render all the line in one pass without checking
      foo(0, line.length,null)
      return;
    }

    let timeToRender;

    for (let i = 0, len = line.length - 1; i <= len; i++) {
      timeToRender = i === len || this.charSpacing;
      iteratorFn && iteratorFn(i)
      if (isJustify && !timeToRender) {
        if (this._reSpaceAndTab.test(line[i])) {
          timeToRender = true;
        }
      }
      if (!timeToRender) {
        // if we have charSpacing, we render char by char
        actualStyle = actualStyle || this.getCompleteStyleDeclaration(lineIndex, i);
        nextStyle = this.getCompleteStyleDeclaration(lineIndex, i + 1);

        timeToRender = (specs && specs[lineIndex] && specs[lineIndex][i] !== specs[lineIndex][i + 1]) ||
          this._hasStyleChanged(actualStyle, nextStyle)
      }

      if (timeToRender) {
        foo(firstChar, i, actualStyle)

        firstChar = i + 1;
        actualStyle = nextStyle;
      }
    }
  },
  _renderChars(method: any, ctx: CanvasRenderingContext2D, line: number, left: number, top: number, lineIndex: number) {
    // set proper line offset
    let lineHeight = this.getHeightOfLine(lineIndex),
      charBox,
      boxWidth = 0;
    ctx && ctx.save();
    top -= lineHeight * this._fontSizeFraction / this.lineHeight;
    this.interateTextChunks(lineIndex,
      (a,b) => {
        this._renderChar(method, ctx, lineIndex, a,b, left, top, lineHeight);
        left += boxWidth;
        boxWidth = 0;
      },
      (i) => {
        charBox = this.__charBounds[lineIndex][i];
        if (boxWidth === 0) {
          left += charBox.kernedWidth - charBox.width;
          boxWidth += charBox.width;
        } else {
          boxWidth += charBox.kernedWidth;
        }
      })
    ctx && ctx.restore();
  },
  _renderChar(method: any, ctx: CanvasRenderingContext2D, lineIndex: number, charIndex: number, endCharIndex: number, left: number, top: number) {
    let decl = this._getStyleDeclaration(lineIndex, charIndex),
      fullDecl = this.getCompleteStyleDeclaration(lineIndex, charIndex),
      shouldFill = method === 'fillText' && fullDecl.fill,
      shouldStroke = method === 'strokeText' && fullDecl.stroke && fullDecl.strokeWidth;

    if (method !== "calc" && method !== "both" && !shouldStroke && !shouldFill) {
      return;
    }
    ctx && decl && ctx.save();

    // ctx && this._applyCharStyles(method, ctx, lineIndex, charIndex, fullDecl);
    shouldFill && (fillOffsets = this._setFillStyles(ctx, fullDecl));
    shouldStroke && (strokeOffsets = this._setStrokeStyles(ctx, fullDecl));

    if (decl && decl.textBackgroundColor) {
      this._removeShadow(ctx);
    }
    if (decl && decl.deltaY) {
      top += decl.deltaY;
    }

    fullDecl.special = this._specialArray && this._specialArray[lineIndex] && this._specialArray[lineIndex][charIndex];

    if(this.renderCharCallback){
      // this.renderCharCallback(method, ctx, lineIndex, charIndex ? charIndex - _char.length + 1: 0, _char, left, top, fullDecl)
      this.renderCharCallback(method, ctx, lineIndex, charIndex, endCharIndex, left, top, fullDecl)
    }
    else {
      let text = this._textLines[lineIndex].slice(charIndex, endCharIndex + 1).join("")
      this.runCharRendering(method, ctx, text, left, top, 0, fullDecl);
    }
    ctx && decl && ctx.restore();
  },
  /**
   * Draws a background for the object big as its untransformed dimensions
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _renderBackground(ctx: CanvasRenderingContext2D) {
    if (!this.backgroundColor && !this.backgroundStroke) {
      return;
    }
    let dim = this._getNonTransformedDimensions();
    if(this.backgroundColor) {
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(
        -dim.x / 2,
        -dim.y / 2,
        dim.x,
        dim.y
      )
    }

    if(this.backgroundStroke){
      this._setStrokeStyles(ctx, this.backgroundStroke);
      ctx.strokeRect(
        -dim.x / 2,
        -dim.y / 2,
        dim.x,
        dim.y
      )
    }
    this._removeShadow(ctx);
  },
  runCharRendering(method: any, ctx: CanvasRenderingContext2D, _char: string, left: number, top: number, angle: number, fullDecl: any, alignment: any) {
    if(ctx){
      ctx.save();
      ctx.translate(left, top)
      ctx.rotate(angle)
    }
    for(let i in this.textRenders){
      let result = this[this.textRenders[i]](method, ctx, _char, fullDecl, alignment, left, top, angle)
      if(result === true)break;
    }
    if(ctx) {
      ctx.restore()
    }
  },
  
  defaultTextRender(method: any, ctx: CanvasRenderingContext2D, _char: string, decl: any) {
    if(method === "both"){
      if (decl.fill && this.paintFirst === 'fill') {
        ctx.fillText(_char, 0,0);
      }
      if(decl.stroke && decl.strokeWidth) {
        if (this.shadow && !this.shadow.affectStroke) {
          this._removeShadow(ctx);
        }
        ctx.save();
        this._setLineDash(ctx, this.strokeDashArray);
        ctx.beginPath();
        ctx.strokeText(_char, 0,0);
        ctx.closePath();
        ctx.restore();
      }
      if (decl.fill && this.paintFirst === 'stroke') {
        ctx.fillText(_char, 0,0);
      }
    }
    else{
      method === 'fillText' && decl.fill && ctx.fillText(_char, 0,0);
      method === 'strokeText' && decl.stroke && decl.strokeWidth && ctx.strokeText(_char, 0,0);
    }
    return true;
  },
  setTextFill(value: string) {
    this.setStyle("fill", value);
  },
  getTextFill() {
    let fill = this.getStyle("fill"); //texture pattern fill fix
    return typeof fill === "string" ? fill : "transparent";
  },
 
  setData(data: any) {
    if (data.role === "fontFamily") {
      this.setFontFamily(data.fontFamily)
    }
  },
  getStyle(styleName: string) {
    if (this.getSelectionStyles && this.isEditing){
      let selectionPosition;
      if(this.selectionStart === this.selectionEnd){
        selectionPosition = this.selectionStart > 0 ? this.selectionStart - 1 : this.selectionStart;
      }else{
        selectionPosition = this.selectionStart;
      }
      let style = this.getStyleAtPosition(selectionPosition)[styleName];
      return style !== undefined ? style : this[styleName];
    }else{
      return (this[styleName] === undefined ? this['__' + styleName] : this[styleName]);
    }
  },
  getPattern (url: string) {
    let _fill = this.getStyle('fill ');
    return _fill && _fill.source;
  },
  setPattern (url?: string) {
    if (!url) {
      this.setStyle('fill');
    } else {
      // todo
      // util.loadImage(url, (img) => {
      //   this.setStyle('fill', new Pattern({
      //     source: img,
      //     repeat: 'repeat'
      //   }));
      // }); 
    }
  },
  setShadow(options: any) {
    return this.setProperty('shadow', options ? new Shadow(options) : null);
  },
  getSpacing() {
    return this.get('spacing');
  },
  setSpacing(value: any) {
    this.setProperty('spacing', value);
  },
  getReverted() {
    return this.get('reverted');
  },
  setReverted(value: any) {
    this.setProperty('reverted', value);
  },
  getText() {
    return this.get('text');
  },
  setFontFamily(value: any, callback: any) {
    this.setProperty('fontFamily', "" + value);
    this._forceClearCache = true
    this.dirty = true
    this.initDimensions()
    if (value && this.renderOnFontsLoaded){
      let fontsArray = [value]
      this.renderOnFontsLoaded(fontsArray, callback)
    }
    else {
      callback && callback()
    }
  },
  setStyles(value: any, callback: any) {
    this.styles = value ? JSON.parse(JSON.stringify(value)) : {}
    this._forceClearCache = true
    this.dirty = true
    this.initDimensions()
    if(value && this.renderOnFontsLoaded){
      let fonts = this.getUsedFonts()
      this.renderOnFontsLoaded(fonts,callback)
    }
    else{
      callback && callback()
    }
  },
  setText(value: string) {
    this.setProperty('text', "" + value);
  },
  getTextAlign() {
    return this.get('textAlign');
  },
  setTextAlign(value: string) {
    this.setProperty('textAlign', value.toLowerCase());
  },
  getBgColor () {
    return this.get('backgroundColor');
  },
  setBgColor(value: string) {
    this.setProperty('backgroundColor', value);
  },
  getTextBgColor() {
    return this.get('textBackgroundColor');
  },
  setTextBgColor(value: string) {
    this.setProperty('textBackgroundColor', value);
  },
  _shouldClearDimensionCache() {
    let shouldClear = this._forceClearCache;
    shouldClear || (shouldClear = this.hasStateChanged('_dimensionAffectingProps'));
    if (shouldClear) {
      this.dirty = true;
      this._forceClearCache = false;
      if(this.group){
        this.group.dirty = true;
      }
    }
    return shouldClear;
  },
  
  getStylePosition(index: number) {
    return this.get2DCursorLocation(index);
  },
  getTextLines() {
    return this.textLines.map(line => line.length);
  },
  setTextLines(val: any) {
    // console.log("text lines",val,this.textLines);
  },
  cleanStyle(property: any) {
    if (!this.styles || !property || property === '') {
      return false;
    }
    let obj = this.styles, stylesCount = 0, letterCount, stylePropertyValue,
      allStyleObjectPropertiesMatch = true, graphemeCount = 0, styleObject;
    // eslint-disable-next-line
    for (let p1 in obj) {
      letterCount = 0;
      // eslint-disable-next-line
      for (let p2 in obj[p1]) {
        let styleObject = obj[p1][p2],
          stylePropertyHasBeenSet = styleObject.hasOwnProperty(property);

        stylesCount++;

        if (stylePropertyHasBeenSet) {
          if (!stylePropertyValue) {
            stylePropertyValue = styleObject[property];
          }
          else if (styleObject[property] !== stylePropertyValue) {
            allStyleObjectPropertiesMatch = false;
          }

          if (styleObject[property] === this[property]) {
            delete styleObject[property];
          }
        }
        else {
          allStyleObjectPropertiesMatch = false;
        }

        if (Object.keys(styleObject).length !== 0) {
          letterCount++;
        }
        else {
          delete obj[p1][p2];
        }
      }

      if (letterCount === 0) {
        delete obj[p1];
      }
    }
    // if every grapheme has the same style set then
    // delete those styles and set it on the parent
    for (let i = 0; i < this._textLines.length; i++) {
      graphemeCount += this._textLines[i].length;
    }

    if (allStyleObjectPropertiesMatch && stylesCount === graphemeCount) {

      //edited:  visceroid
      if (stylePropertyValue !== undefined) {
        this[property] = stylePropertyValue;
      }
      this.removeStyle(property);
    }
  },
  
  //overwritten. Assign _measuringContext property to Editor. not to global  To avoid text measuring problems on Nodes.
  //_measuringContext will be individual for every editor.
  getMeasuringContext() {
    let context = this.editor || fabric;
    // if we did not return we have to measure something.
    if (!context._measuringContext) {
      context._measuringContext = this.canvas && this.canvas.contextCache || util.createCanvasElement().getContext('2d');
    }
    return context._measuringContext;
  },
  /**
   * Calculate height of line at 'lineIndex'
   * @param {Number} lineIndex index of line to calculate
   * @return {Number}
   */
  getHeightOfLine(lineIndex: number) {
    if(!this.__lineHeights){
      this.initDimensions();
    }
    if (this.__lineHeights[lineIndex]) {
      return this.__lineHeights[lineIndex];
    }

    let line = this._textLines[lineIndex],
      // char 0 is measured before the line cycle because it nneds to char
      // emptylines
      maxHeight = this.getHeightOfChar(lineIndex, 0);
    for (let i = 1, len = line.length; i < len; i++) {
      maxHeight = Math.max(this.getHeightOfChar(lineIndex, i), maxHeight);
    }

    return this.__lineHeights[lineIndex] = maxHeight * this.lineHeight * this._fontSizeMult;
  },

  _render(ctx: CanvasRenderingContext2D) {
    console.log('this:', this)
    ctx.save()
    ctx.translate(-this._contentOffsetX, -this._contentOffsetY)
    if(!this.__lineHeights){
      this.initDimensions();
    }
    this._setTextStyles(ctx);
    this._renderTextLinesBackground(ctx);
    this._renderTextDecoration(ctx, 'underline');
    this._renderText(ctx);
    this._renderTextDecoration(ctx, 'overline');
    this._renderTextDecoration(ctx, 'linethrough');
    ctx.restore()
  },
});

Object.assign(ArcText.prototype, ArcTextMixin, {
  lockOnEdit: true,

  onInput(e: Event) {
    let fromPaste = (this as ITextKeyBehavior).fromPaste;
    this.fromPaste = false;
    e && e.stopPropagation();
    if (!this.isEditing) {
      return;
    }
    const nextText = this._splitTextIntoLines(this.hiddenTextarea.value).graphemeText,
        charCount = this._text.length,
        nextCharCount = nextText.length,
        selectionStart = this.selectionStart, selectionEnd = this.selectionEnd,
        selection = selectionStart !== selectionEnd;
    let removedText, charDiff = nextCharCount - charCount, insertedText, copiedStyle, removeFrom, removeTo;
    if (this.hiddenTextarea.value === '') {

      //modified
      if(this.styles && this.styles[0] && this.styles[0][0]){
        this.styles = {0: {0: Object.assign({},this.styles[0][0])}}
      }
      else{
        this.styles = { };
      }

      this.updateFromTextArea();
      this.fire('changed');
      if (this.canvas) {
        this.canvas.fire('text:changed', { target: this });
        this.canvas.requestRenderAll();
      }
      return;
    }

    let textareaSelection = this.fromStringToGraphemeSelection(
        this.hiddenTextarea.selectionStart,
        this.hiddenTextarea.selectionEnd,
        this.hiddenTextarea.value
    );
    const backDelete = selectionStart > textareaSelection.selectionStart;
    if (selection) {
      removedText = this._text.slice(selectionStart, selectionEnd);
      charDiff += selectionEnd - selectionStart;
    }
    else if (nextCharCount < charCount) {
      if (backDelete) {
        removedText = this._text.slice(selectionEnd + charDiff, selectionEnd);
      }
      else {
        removedText = this._text.slice(selectionStart, selectionStart - charDiff);
      }
    }
    insertedText = nextText.slice(textareaSelection.selectionEnd - charDiff, textareaSelection.selectionEnd);
    if (removedText && removedText.length) {
      if (insertedText.length) {
        // let's copy some style before deleting.
        // we want to copy the style before the cursor OR the style at the cursor if selection
        // is bigger than 0.
        copiedStyle = this.getSelectionStyles(selectionStart, selectionStart + 1, false) as any;
        // now duplicate the style one for each inserted text.
        copiedStyle = insertedText.map( () => copiedStyle[0]);
      }
      if (selection) {
        removeFrom = selectionStart;
        removeTo = selectionEnd;
      }
      else if (backDelete) {
        // detect differencies between forwardDelete and backDelete
        removeFrom = selectionEnd - removedText.length;
        removeTo = selectionEnd;
      }
      else {
        removeFrom = selectionEnd;
        removeTo = selectionEnd + removedText.length;
      }
      this.removeStyleFromTo(removeFrom, removeTo);
    }
    if (insertedText.length) {
      const { copyPasteData } = getEnv()
      if (fromPaste && insertedText.join('') === copyPasteData.copiedText && !config.disableStyleCopyPaste) {
        copiedStyle = copyPasteData.copiedStyle;
      }
      this.insertNewStyleBlock(insertedText, selectionStart, copiedStyle);
    }
    this.updateFromTextArea();
    this.fire('changed');
    if (this.canvas) {
      this.canvas.fire('text:changed', { target: this });
      this.canvas.requestRenderAll();
    }
  },

  /**
   * Handles keyup event
   * @param {Event} e Event object
   */
  onKeyDown(e: KeyboardEvent) {
    if (!this.isEditing || this.inCompositionMode) return
    let action;
    if (e.keyCode in this.keysMap) {
      action = this.keysMap[e.keyCode];
    }
    else if ((e.keyCode in this.ctrlKeysMapDown) && (e.ctrlKey || e.metaKey)) {
      action = this.ctrlKeysMapDown[e.keyCode];
    }
    else {
      return;
    }

    this[action](e);

    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.keyCode >= 33 && e.keyCode <= 40 || action === "selectAll") {
      // if i press an arrow key just update selection
      this.clearContextTop();
      this.renderCursorOrSelection();
    }
    else {
      this.canvas && this.canvas.requestRenderAll();
    }
  },

  getLocalPointer(e: any, pointer: Point) {
    pointer = pointer || this.canvas.getPointer(e);
    var pClicked = new Point(pointer.x, pointer.y),
        objectLeftTop = this._getLeftTopCoords();
    if (this.angle) {
      pClicked = util.rotatePoint(pClicked, objectLeftTop, degreesToRadians(-this.angle));
    }
    return {
      x: pClicked.x - objectLeftTop.x,
      y: pClicked.y - objectLeftTop.y
    };
  },
  //todo do not render ursor here
  // _setEditingProps() {
  //   this.hoverCursor = 'text';

  //   if (this.canvas) {
  //     this.canvas.defaultCursor = this.canvas.moveCursor = 'text';
  //   }

  //   this.borderColor = this.editingBorderColor;
  //   if(this.lockOnEdit){
  //     this.hasControls = this.selectable = false;
  //     this.lockMovementX = this.lockMovementY = true;
  //   }
  // },
  
  getSelectionStartFromPointer(e: any) {
    let mouseOffset = this.getLocalPointer(e),
      prevWidth = 0,
      width = 0,
      height = 0,
      charIndex = 0,
      lineIndex = 0,
      lineLeftOffset,
      line;

    for (let i = 0, len = this._textLines.length; i < len; i++) {
      if (height <= mouseOffset.y) {
        height += this.getHeightOfLine(i) * this.scaleY;
        lineIndex = i;
        if (i > 0) {
          charIndex += this._textLines[i - 1].length + this.missingNewlineOffset(i - 1);
        }
      }
      else {
        break;
      }
    }
    lineLeftOffset = this._getLineLeftOffset(lineIndex);


    if(this.__lineInfo && this.__lineInfo[lineIndex]){
      lineLeftOffset += this.__lineInfo[lineIndex].renderedLeft
    }

    width = lineLeftOffset * this.scaleX
    line = this._textLines[lineIndex]
    const jlen = line.length
    for (let j = 0; j < jlen; j++) {
      prevWidth = width;
      // i removed something about flipX here, check.
      width += this.__charBounds[lineIndex][j].kernedWidth * this.scaleX;
      if (width <= mouseOffset.x) {
        charIndex++;
      }
      else {
        break;
      }
    }
    return this._getNewSelectionStartFromOffset(mouseOffset, prevWidth, width, charIndex, jlen);
  },
  /**
   * @private aded options.e._group for editing texts inside groups
   */
  mouseMoveHandler(options) {
    if (!this.__isMousedown || !this.isEditing) {
      return;
    }

    if(this.group){
      options.e._group = this.group;
    }
    let newSelectionStart = this.getSelectionStartFromPointer(options.e),
      currentStart = this.selectionStart,
      currentEnd = this.selectionEnd;
    if (
      (newSelectionStart !== this.__selectionStartOnMouseDown || currentStart === currentEnd)
      &&
      (currentStart === newSelectionStart || currentEnd === newSelectionStart)
    ) {
      return;
    }
    if (newSelectionStart > this.__selectionStartOnMouseDown) {
      this.selectionStart = this.__selectionStartOnMouseDown;
      this.selectionEnd = newSelectionStart;
    }
    else {
      this.selectionStart = newSelectionStart;
      this.selectionEnd = this.__selectionStartOnMouseDown;
    }
    if (this.selectionStart !== currentStart || this.selectionEnd !== currentEnd) {
      this.restartCursorIfNeeded();
      this._fireSelectionChanged();
      this._updateTextarea();
      this.renderCursorOrSelection();
    }

    if(this.group){
      delete options.e._group;
    }
  },
  getStyles () {
    if (!Object.keys(this.styles).length) return null;
    let _styles = {};
    let _is_not_empty = false;
    for (let row in this.styles) {
      if (Object.keys(this.styles[row]).length) {
        let _row_empty = true;
        for (let char in this.styles[row]) {
          if (Object.keys(this.styles[row][char]).length) {
            if (_row_empty) {
              _styles[row] = {};
              _row_empty = false;
            }
            _styles[row][char] = util.object.clone(this.styles[row][char]);
          }
        }
        if (!_row_empty) {
          _is_not_empty = true;
        }
      }
    }
    return _is_not_empty && _styles || null;
  },
  initHiddenTextareaNative: ArcText.prototype.initHiddenTextarea,
  initHiddenTextarea () {
    this.initHiddenTextareaNative();
    this.hiddenTextarea.style.width = "9999px";
    this.hiddenTextarea.style["margin-left"] = "-9999px";
  },

  exitEditing () {
    let isTextChanged = (this._textBeforeEdit !== this.text);
    this.selected = false;
    this.isEditing = false;

    this.selectionEnd = this.selectionStart;

    if (this.hiddenTextarea) {
      this.hiddenTextarea.blur && this.hiddenTextarea.blur();
      this.canvas && this.hiddenTextarea.parentNode.removeChild(this.hiddenTextarea);
      this.hiddenTextarea = null;
    }

    this.abortCursorAnimation();
    this._restoreEditingProps();
    this._currentCursorOpacity = 0;
    if (this._forceClearCache) {
      this.initDimensions();
      this.setCoords();
    }
    this.fire('editing:exited');

    if (this.canvas) {
      this.canvas.off('mouse:move', this.mouseMoveHandler);
      this.canvas.fire('text:editing:exited', { target: this });
    }

    return this;
  }
});

// Object.assign(ArcText.prototype, ArcTextMixin, {
//   // initialize(options,callback) {
//   //   Text.prototype.initialize.call(this, options,callback);
//   //   this.initBehavior();
//   // },
//   isEmptyStylesOverwritten: ArcText.prototype.isEmptyStyles,

//   isEmptyStyles(lineIndex: number) {
//     if(!this._styleMap)return true;
//     return this.isEmptyStylesOverwritten(lineIndex)
//   },
//   getStylePosition(index: number) {
//     let loc = (this as Text).get2DCursorLocation(index);
//     if (this._styleMap && !this.isWrapping) {
//       let map = this._styleMap[loc.lineIndex];
//       if (!map) {
//         return null;
//       }
//       loc.lineIndex = map.line;
//       loc.charIndex = map.offset + loc.charIndex;
//     }
//     return loc;
//   }
// });

classRegistry.setClass(ArcText, 'ArcText')