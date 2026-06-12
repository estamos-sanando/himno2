import React, { useRef, useEffect, useState } from "react";

interface ScrollVideoLogoProps {
  /**
   * Set to true if frame 0 is disassembled and the end frame is assembled.
   * If false, frame 0 is assembled and the end frame is disassembled.
   * Default is true.
   */
  invertDirection?: boolean;
}

export default function ScrollVideoLogo({ invertDirection = true }: ScrollVideoLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const targetProgress = useRef(0);
  const currentProgress = useRef(0);
  const [progressState, setProgressState] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);

  // Handle video metadata loaded
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setVideoDuration(video.duration);
    setIsLoaded(true);
    
    // Set initial position based on direction
    if (invertDirection) {
      video.currentTime = video.duration;
    } else {
      video.currentTime = 0;
    }
  };

  // Wheel and Touch Event Listeners bound to window for better accessibility
  useEffect(() => {
    // Mouse wheel handler
    const handleWheel = (e: WheelEvent) => {
      // Prevent default page scrolling while interacting with the intro
      e.preventDefault();
      
      const sensitivity = 0.001; // Adjust scroll speed here
      let newProgress = targetProgress.current + e.deltaY * sensitivity;
      newProgress = Math.max(0, Math.min(1, newProgress));
      
      targetProgress.current = newProgress;
    };

    // Mobile touch swipe handlers
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const currentY = e.touches[0].clientY;
        const deltaY = touchStartY - currentY; // Positive when swiping up (scrolling down)
        touchStartY = currentY;
        
        const sensitivity = 0.003; // Touch swipe sensitivity
        let newProgress = targetProgress.current + deltaY * sensitivity;
        newProgress = Math.max(0, Math.min(1, newProgress));
        
        targetProgress.current = newProgress;
        e.preventDefault(); // Block pull-to-refresh or page bouncing
      }
    };

    // Attach listeners to window with passive: false to allow preventDefault
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Smooth Interpolation Bucle (Lerp)
  useEffect(() => {
    let frameId: number;
    
    const updateVideoFrame = () => {
      const video = videoRef.current;
      if (video && video.duration && !isNaN(video.duration)) {
        const diff = targetProgress.current - currentProgress.current;
        
        // Only seek if there is a meaningful difference to avoid CPU overhead
        if (Math.abs(diff) > 0.001) {
          const lerpFactor = 0.15; // Smooth interpolation speed (0.1 = slow/smooth, 0.3 = fast)
          currentProgress.current += diff * lerpFactor;
          
          // Clamp current progress
          currentProgress.current = Math.max(0, Math.min(1, currentProgress.current));
          
          // Map progress to video currentTime
          const mappedTime = invertDirection
            ? (1 - currentProgress.current) * video.duration
            : currentProgress.current * video.duration;
            
          // Set video time (safety bounds: 0 to duration - 0.05s to prevent overshoot)
          video.currentTime = Math.max(0, Math.min(video.duration - 0.05, mappedTime));
          setProgressState(currentProgress.current);
        }
      }
      
      frameId = requestAnimationFrame(updateVideoFrame);
    };

    frameId = requestAnimationFrame(updateVideoFrame);
    return () => cancelAnimationFrame(frameId);
  }, [invertDirection]);

  return (
    <div 
      ref={containerRef}
      className="scroll-video-logo-container"
      style={{
        position: "relative",
        width: "280px",
        height: "280px",
        margin: "0 auto 20px auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "ns-resize",
        borderRadius: "50%",
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        boxShadow: "inset 0 0 20px rgba(116, 172, 223, 0.1), 0 0 30px rgba(0, 0, 0, 0.2)",
        overflow: "hidden"
      }}
    >
      <video
        ref={videoRef}
        src="/logo.mp4"
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none", // Prevent native video controls or clicks
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 0.5s ease"
        }}
      />

      {!isLoaded && (
        <div style={{ position: "absolute", color: "var(--text-muted)", fontSize: "14px" }}>
          Cargando escudo...
        </div>
      )}

      {isLoaded && (
        <div
          className="scroll-prompt-indicator"
          style={{
            position: "absolute",
            bottom: "16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            opacity: progressState < 0.1 ? 1 - (progressState * 10) : 0,
            pointerEvents: "none",
            transition: "opacity 0.2s ease",
            color: "var(--cyan)",
            textShadow: "0 0 8px rgba(0, 242, 254, 0.6)"
          }}
        >
          {/* Animated mouse icon */}
          <div 
            className="mouse-icon"
            style={{
              width: "14px",
              height: "24px",
              border: "1.5px solid var(--cyan)",
              borderRadius: "8px",
              position: "relative",
              display: "flex",
              justifyContent: "center"
            }}
          >
            <div 
              className="mouse-dot"
              style={{
                width: "3px",
                height: "5px",
                background: "var(--cyan)",
                borderRadius: "50%",
                marginTop: "4px",
                animation: "mouse-wheel-scroll 1.5s infinite"
              }}
            />
          </div>
          <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>
            Scroll para desarmar
          </span>
        </div>
      )}
    </div>
  );
}
