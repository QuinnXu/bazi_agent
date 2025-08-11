"use client"

import { useEffect, useRef } from "react"

export function MinimalBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    // Neutral color palette
    const neutralColors = [
      "rgba(245, 245, 244, 0.4)", // stone-100
      "rgba(231, 229, 228, 0.3)", // stone-200
      "rgba(214, 211, 209, 0.2)", // stone-300
      "rgba(168, 162, 158, 0.15)", // stone-400
      "rgba(120, 113, 108, 0.1)", // stone-500
      "rgba(250, 250, 249, 0.5)", // stone-50
    ]

    // Floating elements
    const elements: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      color: string
      opacity: number
      rotation: number
      rotationSpeed: number
    }> = []

    // Create minimal floating elements
    for (let i = 0; i < 8; i++) {
      elements.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 120 + 60,
        color: neutralColors[Math.floor(Math.random() * neutralColors.length)],
        opacity: Math.random() * 0.3 + 0.1,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.002,
      })
    }

    let animationId: number
    let time = 0

    const animate = () => {
      time += 0.01

      // Clear canvas with subtle gradient
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, "rgba(250, 250, 249, 1)") // stone-50
      gradient.addColorStop(0.5, "rgba(255, 255, 255, 1)") // white
      gradient.addColorStop(1, "rgba(245, 245, 244, 1)") // stone-100

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw and update floating elements
      elements.forEach((element, index) => {
        // Update position
        element.x += element.vx
        element.y += element.vy
        element.rotation += element.rotationSpeed

        // Add gentle floating motion
        element.x += Math.sin(time * 0.3 + index * 0.8) * 0.3
        element.y += Math.cos(time * 0.2 + index * 0.6) * 0.2

        // Wrap around edges
        if (element.x < -element.size) element.x = canvas.width + element.size
        if (element.x > canvas.width + element.size) element.x = -element.size
        if (element.y < -element.size) element.y = canvas.height + element.size
        if (element.y > canvas.height + element.size) element.y = -element.size

        // Create subtle gradient for element
        const elementGradient = ctx.createRadialGradient(element.x, element.y, 0, element.x, element.y, element.size)
        elementGradient.addColorStop(0, element.color)
        elementGradient.addColorStop(1, "rgba(0, 0, 0, 0)")

        // Draw element with subtle blur
        ctx.save()
        ctx.globalAlpha = element.opacity * (0.7 + 0.3 * Math.sin(time * 0.5 + index))
        ctx.filter = "blur(30px)"
        ctx.translate(element.x, element.y)
        ctx.rotate(element.rotation)
        ctx.fillStyle = elementGradient
        ctx.fillRect(-element.size / 2, -element.size / 2, element.size, element.size)
        ctx.restore()
      })

      // Add very subtle noise texture
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.008) {
          const noise = Math.random() * 8
          data[i] = Math.min(255, data[i] + noise) // R
          data[i + 1] = Math.min(255, data[i + 1] + noise) // G
          data[i + 2] = Math.min(255, data[i + 2] + noise) // B
        }
      }

      ctx.putImageData(imageData, 0, 0)

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10"
      style={{ filter: "contrast(1.02) brightness(1.01)" }}
    />
  )
}
