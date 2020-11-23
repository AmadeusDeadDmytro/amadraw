import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import rough from 'roughjs/bin/rough'
import { RoughCanvas } from 'roughjs/bin/canvas'

type AmadrawElement = ReturnType<typeof newElement>
type AmadrawTextElement = AmadrawElement & {
    type: 'text'
    font: string
    text: string
    actualBoundingBoxAscent: number
}

let elements = Array.of<AmadrawElement>()

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

const newElement = (type: string, x: number, y: number, width = 0, height = 0) => {
    const element = {
        type: type,
        x: x,
        y: y,
        width: width,
        height: height,
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

const exportAsPNG = ({ exportBackground, exportVisibleOnly, exportPadding = 10 }: { exportBackground: boolean; exportVisibleOnly: boolean; exportPadding: number }) => {
    if (!elements.length) return alert('Нельзя сохранять пустое полотно')

    // снимаем выделение и делаем ререндер
    clearSelection()
    drawScene()

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

    if (exportBackground) {
        tempCanvasCtx.fillStyle = '#FFF'
        tempCanvasCtx.fillRect(0, 0, canvas.width, canvas.height)
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
}

const rotate = (x1: number, y1: number, x2: number, y2: number, angle: number) => {
    // 𝑎′𝑥=(𝑎𝑥−𝑐𝑥)cos𝜃−(𝑎𝑦−𝑐𝑦)sin𝜃+𝑐𝑥
    // 𝑎′𝑦=(𝑎𝑥−𝑐𝑥)sin𝜃+(𝑎𝑦−𝑐𝑦)cos𝜃+𝑐𝑦.
    // https://math.stackexchange.com/questions/2204520/how-do-i-rotate-a-line-segment-in-a-specific-point-on-the-line
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
        const shape = generator.rectangle(0, 0, element.width, element.height)
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            rc.draw(shape)
            context.translate(-element.x, -element.y)
        }
    } else if (element.type === 'ellipse') {
        const shape = generator.ellipse(element.width / 2, element.height / 2, element.width, element.height)
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            rc.draw(shape)
            context.translate(-element.x, -element.y)
        }
    } else if (element.type === 'arrow') {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = getArrowPoints(element)

        const shapes = [
            //    \
            generator.line(x3, y3, x2, y2),
            // -----
            generator.line(x1, y1, x2, y2),
            //    /
            generator.line(x4, y4, x2, y2),
        ]
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
            context.fillText(element.text, element.x, element.y + element.actualBoundingBoxAscent)
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

type AppState = {
    draggingElement: AmadrawElement | null
    elementType: string
    exportBackground: boolean
    exportVisibleOnly: boolean
    exportPadding: number
}

class App extends React.Component<{}, AppState> {
    componentDidMount() {
        document.addEventListener('keydown', this.onKeyDown, false)
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.onKeyDown, false)
    }

    private onKeyDown = (event: KeyboardEvent) => {
        if ((event.target as HTMLElement).nodeName === 'INPUT') {
            return
        }

        if (event.key === 'Escape') {
            clearSelection()
            drawScene()
        } else if (event.key === 'Backspace') {
            deleteSelectedElements()
            drawScene()
            event.preventDefault()
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const step = event.shiftKey ? 5 : 1
            elements.forEach((element) => {
                if (element.isSelected) {
                    if (event.key === 'ArrowLeft') element.x -= step
                    else if (event.key === 'ArrowRight') element.x += step
                    else if (event.key === 'ArrowUp') element.y -= step
                    else if (event.key === 'ArrowDown') element.y += step
                }
            })
            drawScene()
            event.preventDefault()
        }
    }

    public state: AppState = {
        draggingElement: null,
        elementType: 'selection',
        exportBackground: false,
        exportVisibleOnly: true,
        exportPadding: 10,
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
                        drawScene()
                    }}
                />
                {children}
            </label>
        )
    }

    public render() {
        return (
            <>
                <div className="exportWrapper">
                    <button
                        onClick={() => {
                            exportAsPNG({
                                exportBackground: this.state.exportBackground,
                                exportVisibleOnly: this.state.exportVisibleOnly,
                                exportPadding: this.state.exportPadding,
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
                        drawScene()
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
                            drawScene()
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
                        const element: AmadrawElement = newElement(this.state.elementType, x, y)
                        let isDraggingElements = false
                        const cursorStyle = document.documentElement.style.cursor
                        if (this.state.elementType === 'selection') {
                            const hitElement = elements.find(element => {
                                return hitTest(element, x, y)
                            })

                            // Если мы на что-то кликнули
                            if(hitElement){
                                if (hitElement.isSelected){
                                    // Если элемент выбран, нам ничего не нужно делать, просто перетащить его
                                } else {
                                    // Снимаем выделение со всех остальных элементов, если не зажат shift
                                    if(!e.shiftKey){
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
                                    drawScene()
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
                            drawScene()
                        }

                        const onMouseUp = () => {
                            const { draggingElement, elementType } = this.state

                            window.removeEventListener('mousemove', onMouseMove)
                            window.removeEventListener('mouseup', onMouseUp)

                            document.documentElement.style.cursor = cursorStyle

                            if (draggingElement === null) {
                                clearSelection()
                                drawScene()
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
                            drawScene()
                        }

                        window.addEventListener('mousemove', onMouseMove)
                        window.addEventListener('mouseup', onMouseUp)

                        drawScene()
                    }}
                />
            </>
        )
    }
}

const rootElement = document.getElementById('root')
ReactDOM.render(<App />, rootElement)
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const rc = rough.canvas(canvas)
const context = canvas.getContext('2d') as CanvasRenderingContext2D
context.translate(0.5, 0.5)

const drawScene = () => {
    ReactDOM.render(<App />, rootElement)
    context.clearRect(-0.5, -0.5, canvas.width, canvas.height)

    elements.forEach((element) => {
        const elementX1 = getElementAbsoluteX1(element)
        const elementX2 = getElementAbsoluteX2(element)
        const elementY1 = getElementAbsoluteY1(element)
        const elementY2 = getElementAbsoluteY2(element)

        element.draw(rc, context)

        if (element.isSelected) {
            const margin = 4
            const lineDash = context.getLineDash()
            context.setLineDash([8, 4])
            context.strokeRect(elementX1 - margin, elementY1 - margin, elementX2 - elementX1 + margin * 2, elementY2 - elementY1 + margin * 2)
            context.setLineDash(lineDash)
        }
    })
}

drawScene()
