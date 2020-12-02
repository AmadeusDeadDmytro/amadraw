import './index.css'

import React from 'react'
import ReactDOM from 'react-dom'
import { RoughCanvas } from 'roughjs/bin/canvas'
import rough from 'roughjs/bin/rough'

type AmadrawElement = ReturnType<typeof newElement>
type AmadrawTextElement = AmadrawElement & {
    type: 'text'
    font: string
    text: string
    actualBoundingBoxAscent: number
}

const LOCAL_STORAGE_KEY = 'amadraw'
const LOCAL_STORAGE_KEY_STATE = 'amadraw-state'

let elements = Array.of<AmadrawElement>()

// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript/47593316#47593316
const LCG = (seed: number) => () => ((2 ** 31 - 1) & (seed = Math.imul(48271, seed))) / 2 ** 31

// К сожаление, roughjs не поддерживает атрибут зерна
// Пришлось сделать свой аналог, переписав Math.random
const withCustomMathRandom = <T, >(seed: number, cb: () => T ) => {
    const random = Math.random;
    Math.random = LCG(seed);
    const result = cb();
    Math.random = random;   
    return result;
}

// Функция вычисления расстояния от точки на канвасе к элементу
const distanceBetweenPointAndSegment = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = x - x1
    const B = y - y1
    const C = x2 - x1
    const D = y2 - y1

    const dot = A * C + B * D
    const lenSquare = C * C + D * D

    let param = -1
    if (lenSquare !== 0) {
        param = dot / lenSquare
    }

    let xx, yy
    if (param < 0) {
        xx = x1
        yy = y1
    } else if (param > 1) {
        xx = x2
        yy = y2
    } else {
        xx = x1 + param * C
        yy = y1 + param * D
    }

    const dx = x - xx
    const dy = y - yy
    return Math.sqrt(dx * dx + dy * dy)
}

const hitTest = (element: AmadrawElement, x: number, y: number) => {
    // Для фигур, состоящих из линий, мы включаем выбор точки только тогда, когда расстояние клика меньше x пикселей любой из линий, из которых состоит фигура
    const lineThreshold = 10

    if (element.type === 'rectangle' || element.type === 'ellipse') {
        const x1 = getElementAbsoluteX1(element)
        const x2 = getElementAbsoluteX2(element)
        const y1 = getElementAbsoluteY1(element)
        const y2 = getElementAbsoluteY2(element)

        return (
            distanceBetweenPointAndSegment(x, y, x1, y1, x2, y1) < lineThreshold || // A
            distanceBetweenPointAndSegment(x, y, x2, y1, x2, y2) < lineThreshold || // B
            distanceBetweenPointAndSegment(x, y, x2, y2, x1, y2) < lineThreshold || // C
            distanceBetweenPointAndSegment(x, y, x1, y2, x1, y1) < lineThreshold // D
        )
    } else if (element.type === 'arrow') {
        let [x1, y1, x2, y2, x3, y3, x4, y4] = getArrowPoints(element)

        x -= element.x
        y -= element.y

        return (
            distanceBetweenPointAndSegment(x, y, x3, y3, x2, y2) < lineThreshold ||
            distanceBetweenPointAndSegment(x, y, x1, y1, x2, y2) < lineThreshold ||
            distanceBetweenPointAndSegment(x, y, x4, y4, x2, y2) < lineThreshold
        )
    } else if (element.type === 'text') {
        const x1 = getElementAbsoluteX1(element)
        const x2 = getElementAbsoluteX2(element)
        const y1 = getElementAbsoluteY1(element)
        const y2 = getElementAbsoluteY2(element)

        return x >= x1 && x <= x2 && y >= y1 && y <= y2
    } else {
        throw new Error('Unimplemented type: ' + element.type)
    }
}

const newElement = (type: string, x: number, y: number, strokeColor: string, backgroundColor: string, width = 0, height = 0) => {
    const element = {
        type: type,
        x: x,
        y: y,
        width: width,
        height: height,
        strokeColor: strokeColor,
        backgroundColor: backgroundColor,
        seed: Math.floor(Math.random() * 2 ** 31),
        isSelected: false,
        draw(rc: RoughCanvas, context: CanvasRenderingContext2D) {},
    }
    return element
}

const getArrowPoints = (element: AmadrawElement) => {
    const x1 = 0
    const y1 = 0
    const x2 = element.width
    const y2 = element.height

    const size = 30 //пиксели
    const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
    const minSize = Math.min(size, distance / 2)
    const xs = x2 - ((x2 - x1) / distance) * minSize
    const ys = y2 - ((y2 - y1) / distance) * minSize

    const angle = 20
    const [x3, y3] = rotate(xs, ys, x2, y2, (-angle * Math.PI) / 180)
    const [x4, y4] = rotate(xs, ys, x2, y2, (angle * Math.PI) / 180)

    return [x1, y1, x2, y2, x3, y3, x4, y4]
}

const renderScene = (rc: RoughCanvas, context: CanvasRenderingContext2D, viewBackgroundColor: string | null) => {
    if(!context) return

    const fillStyle = context.fillStyle

    if(typeof viewBackgroundColor === 'string'){
        context.fillStyle = viewBackgroundColor
        context.fillRect(-0.5, -0.5, canvas.width, canvas.height)
    } else {
        context.clearRect(-0.5, -0.5, canvas.width, canvas.height)
    }
    context.fillStyle = fillStyle

    elements.forEach((element) => {
        element.draw(rc, context)
        if (element.isSelected) {
            const margin = 4

            const elementX1 = getElementAbsoluteX1(element)
            const elementX2 = getElementAbsoluteX2(element)
            const elementY1 = getElementAbsoluteY1(element)
            const elementY2 = getElementAbsoluteY2(element)
            const lineDash = context.getLineDash()
            context.setLineDash([8, 4])
            context.strokeRect(elementX1 - margin, elementY1 - margin, elementX2 - elementX1 + margin * 2, elementY2 - elementY1 + margin * 2)
            context.setLineDash(lineDash)
        }
    })
}

const exportAsPNG = ({
    exportBackground,
    exportVisibleOnly,
    exportPadding = 10,
    viewBackgroundColor,
}: {
    exportBackground: boolean
    exportVisibleOnly: boolean
    exportPadding: number
    viewBackgroundColor: string
}) => {
    if (!elements.length) return alert('Нельзя сохранять пустое полотно')

    // снимаем выделение и делаем ререндер
    clearSelection()

    ReactDOM.render(<App />, rootElement, () => {
        // Подсчитываем координаты видимой зоны
        let subCanvasX1 = Infinity
        let subCanvasX2 = 0
        let subCanvasY1 = Infinity
        let subCanvasY2 = 0

        elements.forEach((element) => {
            subCanvasX1 = Math.min(subCanvasX1, getElementAbsoluteX1(element))
            subCanvasX2 = Math.max(subCanvasX2, getElementAbsoluteX2(element))
            subCanvasY1 = Math.min(subCanvasY1, getElementAbsoluteY1(element))
            subCanvasY2 = Math.max(subCanvasY2, getElementAbsoluteY2(element))
        })

        // Создаем временный канвас который и будем экспортировать
        const tempCanvas = document.createElement('canvas') as HTMLCanvasElement
        const tempCanvasCtx = tempCanvas.getContext('2d') as CanvasRenderingContext2D
        tempCanvas.style.display = 'none'
        document.body.appendChild(tempCanvas)
        tempCanvas.width = exportVisibleOnly ? subCanvasX2 - subCanvasX1 + exportPadding * 2 : canvas.width
        tempCanvas.height = exportVisibleOnly ? subCanvasY2 - subCanvasY1 + exportPadding * 2 : canvas.height

        if (!exportBackground) {
            renderScene(rc, context, null)
        }

        // Копируем оригинальный канвас на временный
        tempCanvasCtx.drawImage(
            canvas,
            exportVisibleOnly ? subCanvasX1 - exportPadding : 0,
            exportVisibleOnly ? subCanvasY1 - exportPadding : 0,
            exportVisibleOnly ? subCanvasX2 - subCanvasX1 + exportPadding * 2 : canvas.width,
            exportVisibleOnly ? subCanvasY2 - subCanvasY1 + exportPadding * 2 : canvas.height,
            0,
            0,
            exportVisibleOnly ? tempCanvas.width : canvas.width,
            exportVisibleOnly ? tempCanvas.height : canvas.height,
        )

        const link = document.createElement('a')
        link.setAttribute('download', 'amadraw.png')
        link.setAttribute('href', tempCanvas.toDataURL('image/png'))
        link.click()

        // Очищаем DOM
        link.remove()
        if (tempCanvas !== canvas) tempCanvas.remove()
    })
}

const rotate = (x1: number, y1: number, x2: number, y2: number, angle: number) => {
    return [(x1 - x2) * Math.cos(angle) - (y1 - y2) * Math.sin(angle) + x2, (x1 - x2) * Math.sin(angle) + (y1 - y2) * Math.cos(angle) + y2]
}

const isTextElement = (element: AmadrawElement): element is AmadrawTextElement => {
    return element.type === 'text'
}

let generator = rough.generator(null as any)

const generateDraw = (element: AmadrawElement) => {
    if (element.type === 'selection') {
        element.draw = (rc, context) => {
            const fillStyle = context.fillStyle
            context.fillStyle = 'rgba(0, 0, 255, 0.10)'
            context.fillRect(element.x, element.y, element.width, element.height)
            context.fillStyle = fillStyle
        }
    } else if (element.type === 'rectangle') {
        const shape = withCustomMathRandom(element.seed, () => {
            return generator.rectangle(0, 0, element.width, element.height, { stroke: element.strokeColor, fill: element.backgroundColor })
        })
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            rc.draw(shape)
            context.translate(-element.x, -element.y)
        }
    } else if (element.type === 'ellipse') {
        const shape = withCustomMathRandom(element.seed, () => {
            return generator.ellipse(element.width / 2, element.height / 2, element.width, element.height, { stroke: element.strokeColor, fill: element.backgroundColor })
        })
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            rc.draw(shape)
            context.translate(-element.x, -element.y)
        }
    } else if (element.type === 'arrow') {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = getArrowPoints(element)

        const shapes = withCustomMathRandom(element.seed, () => {
            return [
                //    \
                generator.line(x3, y3, x2, y2, { stroke: element.strokeColor }),
                // -----
                generator.line(x1, y1, x2, y2, { stroke: element.strokeColor }),
                //    /
                generator.line(x4, y4, x2, y2, { stroke: element.strokeColor }),
            ]
        })
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            shapes.forEach((shape) => rc.draw(shape))
            context.translate(-element.x, -element.y)
        }
        return
    } else if (isTextElement(element)) {
        element.draw = (rc, context) => {
            const font = context.font
            context.font = element.font
            const fillStyle = context.fillStyle
            context.fillStyle = element.strokeColor
            context.fillText(element.text, element.x, element.y + element.actualBoundingBoxAscent)
            context.fillStyle = fillStyle
            context.font = font
        }
    } else {
        throw new Error('Некоректный тип ' + element.type)
    }
}

const getElementAbsoluteX1 = (element: AmadrawElement) => {
    return element.width >= 0 ? element.x : element.x + element.width
}
const getElementAbsoluteX2 = (element: AmadrawElement) => {
    return element.width >= 0 ? element.x + element.width : element.x
}
const getElementAbsoluteY1 = (element: AmadrawElement) => {
    return element.height >= 0 ? element.y : element.y + element.height
}
const getElementAbsoluteY2 = (element: AmadrawElement) => {
    return element.height >= 0 ? element.y + element.height : element.y
}

const setSelection = (selection: AmadrawElement) => {
    const selectionX1 = getElementAbsoluteX1(selection)
    const selectionX2 = getElementAbsoluteX2(selection)
    const selectionY1 = getElementAbsoluteY1(selection)
    const selectionY2 = getElementAbsoluteY2(selection)

    elements.forEach((element) => {
        const elementX1 = getElementAbsoluteX1(element)
        const elementX2 = getElementAbsoluteX2(element)
        const elementY1 = getElementAbsoluteY1(element)
        const elementY2 = getElementAbsoluteY2(element)

        element.isSelected = element.type !== 'selection' && selectionX1 <= elementX1 && selectionY1 <= elementY1 && selectionX2 >= elementX2 && selectionY2 >= elementY2
    })
}

const clearSelection = () => {
    elements.forEach((element) => {
        element.isSelected = false
    })
}

const deleteSelectedElements = () => {
    for (let i = elements.length - 1; i >= 0; --i) {
        if (elements[i].isSelected) {
            elements.splice(i, 1)
        }
    }
}

const save = (state: AppState) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(elements))
    localStorage.setItem(LOCAL_STORAGE_KEY_STATE, JSON.stringify(state))
}

const restore = () => {
    try {
        const savedElements = localStorage.getItem(LOCAL_STORAGE_KEY)
        const savedState = localStorage.getItem(LOCAL_STORAGE_KEY_STATE)

        if(savedElements){
            elements = JSON.parse(savedElements)
            elements.forEach((element: AmadrawElement) => generateDraw(element))
        }

        return savedState ? JSON.parse(savedState) : null
    } catch (e) {
        elements = []
        return null
    }
}

type AppState = {
    draggingElement: AmadrawElement | null
    elementType: string
    exportBackground: boolean
    exportVisibleOnly: boolean
    exportPadding: number
    currentItemStrokeColor: string
    currentItemBackgroundColor: string
    viewBackgroundColor: string
}

const KEYS = {
    ARROW_LEFT: 'ArrowLeft',
    ARROW_RIGHT: 'ArrowRight',
    ARROW_UP: 'ArrowUp',
    ARROW_DOWN: 'ArrowDown',
    ESCAPE: 'Escape',
    DELETE: 'Delete',
    BACKSPACE: 'Backspace'
}

const isArrowKey = (keyCode: string) => {
    return (keyCode === KEYS.ARROW_LEFT || keyCode === KEYS.ARROW_RIGHT || keyCode === KEYS.ARROW_DOWN ||keyCode === KEYS.ARROW_UP)
}

const ELEMENT_SHIFT_TRANSLATE_AMOUNT = 5
const ELEMENT_TRANSLATE_AMOUNT = 1

class App extends React.Component<{}, AppState> {
    componentDidMount() {
        document.addEventListener('keydown', this.onKeyDown, false)

        const savedState = restore()
        if(savedState){
            this.setState(savedState)
        }
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.onKeyDown, false)
    }

    private onKeyDown = (event: KeyboardEvent) => {
        if ((event.target as HTMLElement).nodeName === 'INPUT') {
            return
        }

        if (event.key === KEYS.ESCAPE) {
            clearSelection()
            this.forceUpdate()
            event.preventDefault()
        } else if (event.key === KEYS.BACKSPACE || event.key === KEYS.DELETE) {
            deleteSelectedElements()
            this.forceUpdate()
            event.preventDefault()
        } else if (isArrowKey(event.key)) {
            const step = event.shiftKey ? ELEMENT_SHIFT_TRANSLATE_AMOUNT : ELEMENT_TRANSLATE_AMOUNT
            elements.forEach((element) => {
                if (element.isSelected) {
                    if (event.key === KEYS.ARROW_LEFT) element.x -= step
                    else if (event.key === KEYS.ARROW_RIGHT) element.x += step
                    else if (event.key === KEYS.ARROW_UP) element.y -= step
                    else if (event.key === KEYS.ARROW_DOWN) element.y += step
                }
            })
            this.forceUpdate()
            event.preventDefault()
        } else if (event.key === 'a' && event.ctrlKey) {
            elements.forEach((element) => {
                element.isSelected = true
            })
            this.forceUpdate()
            event.preventDefault()
        }
    }

    public state: AppState = {
        draggingElement: null,
        elementType: 'selection',
        exportBackground: false,
        exportVisibleOnly: true,
        exportPadding: 10,
        currentItemStrokeColor: '#000000',
        currentItemBackgroundColor: '#ffffff',
        viewBackgroundColor: '#FFFFFF',
    }

    private renderOption({ type, children }: { type: string; children: React.ReactNode }) {
        return (
            <label>
                <input
                    type={'radio'}
                    checked={this.state.elementType === type}
                    onChange={() => {
                        this.setState({ elementType: type })
                        clearSelection()
                        this.forceUpdate()
                    }}
                />
                {children}
            </label>
        )
    }

    public render() {
        return (
            <div>
                <div className="exportWrapper">
                    <label>
                        <input
                            type="color"
                            value={this.state.currentItemStrokeColor}
                            onChange={(e) => {
                                this.setState({ currentItemStrokeColor: e.target.value })
                            }}
                        />
                        цвет линия элемента
                    </label>
                    <label>
                        <input
                            type="color"
                            value={this.state.currentItemBackgroundColor}
                            onChange={(e) => {
                                this.setState({ currentItemBackgroundColor: e.target.value })
                            }}
                        />
                        цвет фон элемента
                    </label>
                    <button
                        onClick={() => {
                            exportAsPNG({
                                exportBackground: this.state.exportBackground,
                                exportVisibleOnly: this.state.exportVisibleOnly,
                                exportPadding: this.state.exportPadding,
                                viewBackgroundColor: this.state.viewBackgroundColor,
                            })
                        }}
                    >
                        Сохранить в png
                    </button>
                    <label>
                        <input
                            type="checkbox"
                            checked={this.state.exportBackground}
                            onChange={(e) => {
                                this.setState({ exportBackground: e.target.checked })
                            }}
                        />
                        фон
                    </label>
                    <label>
                        <input
                            type="color"
                            value={this.state.viewBackgroundColor}
                            onChange={(e) => {
                                this.setState({ viewBackgroundColor: e.target.value })
                            }}
                        />
                        цвет фона
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={this.state.exportVisibleOnly}
                            onChange={(e) => {
                                this.setState({ exportVisibleOnly: e.target.checked })
                            }}
                        />
                        только видимая часть
                    </label>
                    (отступ:
                    <input
                        type="number"
                        value={this.state.exportPadding}
                        onChange={(e) => {
                            this.setState({ exportPadding: Number(e.target.value) })
                        }}
                        disabled={!this.state.exportVisibleOnly}
                    />
                    px)
                </div>
                <div
                    onCut={(e) => {
                        e.clipboardData.setData('text/plain', JSON.stringify(elements.filter((element) => element.isSelected)))
                        deleteSelectedElements()
                        this.forceUpdate()
                        e.preventDefault()
                    }}
                    onCopy={(e) => {
                        e.clipboardData.setData('text/plain', JSON.stringify(elements.filter((element) => element.isSelected)))
                        e.preventDefault()
                    }}
                    onPaste={(e) => {
                        const paste = e.clipboardData.getData('text')

                        let parsedElements
                        try {
                            parsedElements = JSON.parse(paste)
                        } catch (e) {}

                        if (parsedElements.length > 0 && parsedElements[0].type) {
                            clearSelection()
                            parsedElements.forEach((parsedElement: AmadrawElement) => {
                                parsedElement.x += 10
                                parsedElement.y += 10
                                generateDraw(parsedElement)
                                elements.push(parsedElement)
                            })
                            this.forceUpdate()
                        }

                        e.preventDefault()
                    }}
                >
                    {this.renderOption({ type: 'rectangle', children: 'Прямоугольник' })}
                    {this.renderOption({ type: 'ellipse', children: 'Эллипс' })}
                    {this.renderOption({ type: 'arrow', children: 'Стрелка' })}
                    {this.renderOption({ type: 'text', children: 'Текст' })}
                    {this.renderOption({ type: 'selection', children: 'Выделение' })}
                </div>

                <canvas
                    id={'canvas'}
                    width={window.innerWidth}
                    height={window.innerHeight}
                    onClick={() => {
                        console.log('click')
                    }}
                    onMouseDown={(e) => {
                        const x = e.clientX - (e.target as HTMLElement).offsetLeft
                        const y = e.clientY - (e.target as HTMLElement).offsetTop
                        const element: AmadrawElement = newElement(this.state.elementType, x, y, this.state.currentItemStrokeColor, this.state.currentItemBackgroundColor)
                        let isDraggingElements = false
                        const cursorStyle = document.documentElement.style.cursor
                        if (this.state.elementType === 'selection') {
                            const hitElement = elements.find((element) => {
                                return hitTest(element, x, y)
                            })

                            // Если мы на что-то кликнули
                            if (hitElement) {
                                if (hitElement.isSelected) {
                                    // Если элемент выбран, нам ничего не нужно делать, просто перетащить его
                                } else {
                                    // Снимаем выделение со всех остальных элементов, если не зажат shift
                                    if (!e.shiftKey) {
                                        clearSelection()
                                    }

                                    // Неважно что, просто выбираем это
                                    hitElement.isSelected = true
                                }
                            } else {
                                // Если кликнули на пустое пространство просто убираем выделение
                                clearSelection()
                            }

                            isDraggingElements = elements.some((element) => element.isSelected)

                            if (isDraggingElements) {
                                document.documentElement.style.cursor = 'move'
                            }
                        }
                        if (isTextElement(element)) {
                            const text: string | null = prompt('What text do you want?')
                            if (text === null) {
                                return
                            }
                            element.text = text
                            element.font = '20px Virgil'
                            const font = context.font
                            context.font = element.font
                            const { actualBoundingBoxAscent, actualBoundingBoxDescent, width } = context.measureText(element.text)

                            element.actualBoundingBoxAscent = actualBoundingBoxAscent
                            context.font = font

                            const height = actualBoundingBoxAscent + actualBoundingBoxDescent

                            // Center text
                            element.x -= width / 2
                            element.y -= actualBoundingBoxAscent
                            element.width = width
                            element.height = height
                        }

                        generateDraw(element)
                        elements.push(element)
                        if (this.state.elementType === 'text') {
                            this.setState({
                                draggingElement: null,
                                elementType: 'selection',
                            })
                            element.isSelected = true
                        } else {
                            this.setState({ draggingElement: element })
                        }

                        let lastX = x
                        let lastY = y

                        const onMouseMove = (e: MouseEvent) => {
                            const target = e.target

                            if (!(target instanceof HTMLElement)) {
                                return
                            }

                            if (isDraggingElements) {
                                const selectedElements = elements.filter((el) => el.isSelected)
                                if (selectedElements.length) {
                                    const x = e.clientX - target.offsetLeft
                                    const y = e.clientY - target.offsetTop

                                    selectedElements.forEach((element) => {
                                        element.x += x - lastX
                                        element.y += y - lastY
                                    })
                                    lastX = x
                                    lastY = y
                                    this.forceUpdate()
                                    return
                                }
                            }

                            const draggingElement = this.state.draggingElement

                            if (!draggingElement) return
                            let width = e.clientX - target.offsetLeft - draggingElement.x
                            let height = e.clientY - target.offsetTop - draggingElement.y
                            draggingElement.width = width
                            //shift
                            draggingElement.height = e.shiftKey ? width : height
                            generateDraw(draggingElement)

                            if (this.state.elementType === 'selection') {
                                setSelection(draggingElement)
                            }
                            this.forceUpdate()
                        }

                        const onMouseUp = () => {
                            const { draggingElement, elementType } = this.state

                            window.removeEventListener('mousemove', onMouseMove)
                            window.removeEventListener('mouseup', onMouseUp)

                            document.documentElement.style.cursor = cursorStyle

                            if (draggingElement === null) {
                                clearSelection()
                                this.forceUpdate()
                                return
                            }
                            if (elementType === 'selection') {
                                if (isDraggingElements) {
                                    isDraggingElements = false
                                }
                                elements.pop()
                            } else {
                                draggingElement.isSelected = true
                            }

                            this.setState({
                                draggingElement: null,
                                elementType: 'selection',
                            })
                            this.forceUpdate()
                        }

                        window.addEventListener('mousemove', onMouseMove)
                        window.addEventListener('mouseup', onMouseUp)

                        this.forceUpdate()
                    }}
                />
            </div>
        )
    }

    componentDidUpdate() {
        renderScene(rc, context, this.state.viewBackgroundColor)
        save(this.state)
    }
}

const rootElement = document.getElementById('root')
ReactDOM.render(<App />, rootElement)
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const rc = rough.canvas(canvas)
const context = canvas.getContext('2d') as CanvasRenderingContext2D
context.translate(0.5, 0.5)

ReactDOM.render(<App />, rootElement)
