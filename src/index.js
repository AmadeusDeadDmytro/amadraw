import React, {useCallback, useEffect, useState} from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import rough from 'roughjs/bin/rough'

let elements = []

const newElement = (type, x, y) => {
    const element = {
        type: type,
        x: x,
        y: y,
        width: 0,
        height: 0,
        isSelected: false
    }
    return element
}

const rotate = (x1, y1, x2, y2, angle) => {
    // 𝑎′𝑥=(𝑎𝑥−𝑐𝑥)cos𝜃−(𝑎𝑦−𝑐𝑦)sin𝜃+𝑐𝑥
    // 𝑎′𝑦=(𝑎𝑥−𝑐𝑥)sin𝜃+(𝑎𝑦−𝑐𝑦)cos𝜃+𝑐𝑦.
    // https://math.stackexchange.com/questions/2204520/how-do-i-rotate-a-line-segment-in-a-specific-point-on-the-line
    return [
        (x1 - x2) * Math.cos(angle) - (y1 - y2) * Math.sin(angle) + x2,
        (x1 - x2) * Math.sin(angle) + (y1 - y2) * Math.cos(angle) + y2
    ]
}

let generator = rough.generator()

const generateDraw = (element) => {
    if(element.type === 'selection'){
        element.draw = (rc, context) => {
            const fillStyle = context.fillStyle
            context.fillStyle = 'rgba(0, 0, 255, 0.10)'
            context.fillRect(element.x, element.y, element.width, element.height)
            context.fillStyle = fillStyle
        }
    } else if(element.type === 'rectangle'){
        const shape = generator.rectangle(0, 0, element.width, element.height)
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            rc.draw(shape)
            context.translate(-element.x, -element.y)
        }
    } else if(element.type === 'ellipse'){
        const shape = generator.ellipse(element.width / 2, element.height / 2, element.width, element.height)
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            rc.draw(shape)
            context.translate(-element.x, -element.y)
        }
    } else if(element.type === 'arrow'){
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

        const shapes = [
            //    \
            generator.line(x3, y3, x2, y2),
            // -----
            generator.line(x1, y1, x2, y2),
            //    /
            generator.line(x4, y4, x2, y2)
        ]
        element.draw = (rc, context) => {
            context.translate(element.x, element.y)
            shapes.forEach(shape => rc.draw(shape))
            context.translate(-element.x, -element.y)
        }
        return
    } else if(element.type === 'text'){
        element.draw = (rc, context) => {
            const font = context.font
            context.font = element.font

            context.fillText(element.text, element.x, element.y + element.measure.actualBoundingBoxAscent)
            context.font = font
        }
    } else {
        throw new Error('Некоректный тип ' + element.type)
    }
}

const getElementAbsoluteX1 = element => {
    return element.width >= 0 ? element.x : element.x + element.width
}
const getElementAbsoluteX2 = element => {
    return element.width >= 0 ? element.x + element.width : element.x
}
const getElementAbsoluteY1 = element => {
    return element.height >= 0 ? element.y : element.y + element.height
}
const getElementAbsoluteY2 = element => {
    return element.height >= 0 ? element.y + element.height : element.y
}

const setSelection = selection => {
    const selectionX1 = getElementAbsoluteX1(selection)
    const selectionX2 = getElementAbsoluteX2(selection)
    const selectionY1 = getElementAbsoluteY1(selection)
    const selectionY2 = getElementAbsoluteY2(selection)

    elements.forEach(element => {
        const elementX1 = getElementAbsoluteX1(element)
        const elementX2 = getElementAbsoluteX2(element)
        const elementY1 = getElementAbsoluteY1(element)
        const elementY2 = getElementAbsoluteY2(element)

        element.isSelected =
            element.type !== 'selection' &&
            selectionX1 <= elementX1 &&
            selectionY1 <= elementY1 &&
            selectionX2 >= elementX2 &&
            selectionY2 >= elementY2
    })
}

const clearSelection = () => {
    elements.forEach(element => {
        element.isSelected = false
    })
}

class App extends React.Component {
    componentDidMount() {
        this.onKeyDown = event => {
            if(event.key === "Backspace"){
                for(let i = elements.length - 1; i >= 0; --i){
                    if(elements[i].isSelected){
                        elements.splice(i, 1)
                    }
                }
                drawScene()
                event.preventDefault()
            } else if(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowUp"){
                const step = event.shiftKey ? 5 : 1
                elements.forEach(element => {
                    if(element.isSelected){
                        if(event.key === "ArrowLeft") element.x -= step;
                        else if(event.key === "ArrowRight") element.x += step;
                        else if(event.key === "ArrowUp") element.y -= step;
                        else if(event.key === "ArrowDown") element.y += step;
                    }
                })
                drawScene()
                event.preventDefault()
            }
        }
        document.addEventListener("keydown", this.onKeyDown, false)
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyDown, false)
    }

    constructor() {
        super()
        this.state = {
            draggingElement: null,
            elementType: "selection"
        }
    }

    render () {
        const ElementOption = ({ type, children }) => {
            return (
                <label>
                    <input type={'radio'} checked={this.state.elementType === type} onChange={() => {
                        this.setState({elementType: type})
                        clearSelection()
                        drawScene()
                    }}/>
                    {children}
                </label>
            )
        }

        return (
            <div>
                {ElementOption({ type: "rectangle", children: "Rectangle"})}
                {ElementOption({ type: "ellipse", children: "Ellipse"})}
                {ElementOption({ type: "arrow", children: "Arrow"})}
                {ElementOption({ type: "text", children: "Text"})}
                {ElementOption({ type: "selection", children: "Selection"})}
                <canvas
                    id={'canvas'}
                    width={window.innerWidth}
                    height={window.innerHeight}
                    onClick={() => {
                        console.log('click')
                    }}
                    onMouseDown={e => {
                        const x = e.clientX - e.target.offsetLeft
                        const y = e.clientY - e.target.offsetTop
                        const element = newElement(this.state.elementType, x, y)

                        let isDraggingElements = false
                        const cursorStyle = document.documentElement.style.cursor
                        if(this.state.elementType === 'selection'){
                            isDraggingElements = elements.some(el => {
                                if(el.isSelected) {
                                    const minX = Math.min(el.x, el.x + el.width)
                                    const maxX = Math.max(el.x, el.x + el.width)
                                    const minY = Math.min(el.y, el.y + el.height)
                                    const maxY = Math.max(el.y, el.y + el.height)
                                    return minX <= x && x <= maxX && minY <= y && y <= maxY
                                }
                            })
                            console.log(isDraggingElements)
                            if(isDraggingElements){
                                document.documentElement.style.cursor = 'move'
                            }
                        }

                        if(this.state.elementType === 'text'){
                            const text = prompt('What text do you want?')
                            if(text === null){
                                return
                            }
                            element.text = text
                            element.font = '20px Virgil'
                            const font = context.font
                            context.font = element.font
                            element.measure = context.measureText(element.text)
                            context.font = font

                            const height = element.measure.actualBoundingBoxAscent + element.measure.actualBoundingBoxDescent

                            // Center text
                            element.x -= element.measure.width / 2
                            element.y -= element.measure.actualBoundingBoxAscent
                            element.width = element.measure.width
                            element.height = height
                        }

                        generateDraw(element)
                        elements.push(element)
                        if(this.state.elementType === 'text'){
                            this.setState({
                                draggingElement: null,
                                elementType: 'selection'
                            })
                            element.isSelected = true
                        } else {
                            this.setState({draggingElement: element})
                        }

                        let lastX = x
                        let lastY = y

                        const onMouseMove = e => {
                            if(isDraggingElements) {
                                const selectedElements = elements.filter(el => el.isSelected)
                                if(selectedElements.length){
                                    const x = e.clientX - e.target.offsetLeft
                                    const y = e.clientY - e.target.offsetTop

                                    selectedElements.forEach(element => {
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

                            if(!draggingElement) return
                            let width = e.clientX - e.target.offsetLeft - draggingElement.x
                            let height = e.clientY - e.target.offsetTop - draggingElement.y
                            draggingElement.width = width
                            //shift
                            draggingElement.height = e.shiftKey ? width : height
                            generateDraw(draggingElement)

                            if(this.state.elementType === 'selection'){
                                setSelection(draggingElement)
                            }
                            drawScene()
                        }

                        const onMouseUp= e => {
                            window.removeEventListener("mousemove", onMouseMove)
                            window.removeEventListener("mouseup", onMouseUp)

                            document.documentElement.style.cursor = cursorStyle

                            const draggingElement = this.state.draggingElement
                            if(this.state.draggingElement === null){
                                return
                            }
                            if(this.state.elementType === 'selection'){
                                if(isDraggingElements) {
                                    isDraggingElements = false
                                } else {
                                    setSelection(draggingElement)
                                }

                                elements.pop()
                            } else {
                                draggingElement.isSelected = true
                            }
                            this.setState({
                                draggingElement: null,
                                elementType: "selection"
                            })
                            drawScene()
                        }

                        window.addEventListener("mousemove", onMouseMove)
                        window.addEventListener("mouseup", onMouseUp)

                        drawScene()
                    }}


                >
                </canvas>
            </div>
        )
    }
}

const rootElement = document.getElementById('root')
ReactDOM.render(<App />, rootElement);
const canvas = document.getElementById('canvas')
const rc = rough.canvas(canvas)
const context = canvas.getContext('2d')
context.translate(0.5, 0.5)

const drawScene = () => {
    ReactDOM.render(<App />, rootElement);
    context.clearRect(-0.5, -0.5, canvas.width, canvas.height)

    elements.forEach(element => {
        const elementX1 = getElementAbsoluteX1(element)
        const elementX2 = getElementAbsoluteX2(element)
        const elementY1 = getElementAbsoluteY1(element)
        const elementY2 = getElementAbsoluteY2(element)

        element.draw(rc, context)

        if(element.isSelected){
            const margin = 4
            const lineDash = context.getLineDash()
            context.setLineDash([8, 4])
            context.strokeRect(elementX1 - margin, elementY1 - margin, elementX2 - elementX1 + margin * 2, elementY2 - elementY1 + margin * 2)
            context.setLineDash(lineDash)
        }
    })
}

drawScene()

