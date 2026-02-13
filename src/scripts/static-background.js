document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('staticCanvas');
    // Important: Check if the canvas element actually exists before proceeding
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext('2d');

    let animationFrameId;
    // Use prefers-color-scheme to sync with your CSS :root variables
    let isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    // --- Configurable Parameters ---
    // Basic static effect configuration
    const config = {
        pixelSize: 1.25,       // Keep 1px for authentic fine-grained static
        density: 1,      // Increased from original 0.8 for more dense static
        baseAlpha: 0.85,    // Base alpha for normal mode
        alphaVariance: 0.25, // Alpha variance for normal mode

        // Color ranges (0-255) - Enhanced contrast
        darkIntensityMin: 30,  // Brighter dots on dark bg
        darkIntensityMax: 100, // Wider range for better visibility
        lightIntensityMin: 135, // Darker dots on light bg
        lightIntensityMax: 200, // Wider range for better visibility
        
        // Frame timing
        frameInterval: 40, // Slightly increased from original for performance
        
        // Use partial redraw to improve performance
        usePartialRedraw: true,
        partialRedrawRatio: 0.4, // Redraw 40% of the static per frame
        maxStoredFrames: 5, // Store this many frames for cycling
        
        // Static calculation divisor (lower = more dots)
        staticDivisor: 42, // Reduced from 50 for higher density
        
        // Effect state tracking
        effectState: 'normal', // Can be 'normal', 'intensifying', 'intense', 'fading'
        
        // Intense mode parameters (what we transition to)
        intenseDensity: 1.3,    // Reduced from 1.5 for better performance
        intenseColor: [200, 120, 255], // Purple magic color
        
        // Transition parameters
        transitionProgress: 0,   // Progress from 0-1
        transitionSpeed: 0.012,  // How much to increment per frame
        
        // Effect parameters that will be dynamically calculated
        currentDensity: 0.66,   // Will be updated during transitions
        currentColorMix: 0      // 0 = normal colors, 1 = intense colors
    };
    // -----------------------------

    let lastFrameTime = 0;
    
    // Store previous frames of static
    let staticPixels = [];
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Reset static pixels cache when resizing
        staticPixels = [];
    }

    function drawStatic(timestamp) {
        // --- Frame Rate Limiting ---
        if (timestamp - lastFrameTime < config.frameInterval) {
            animationFrameId = requestAnimationFrame(drawStatic);
            return;
        }
        lastFrameTime = timestamp;
        // --------------------------------------

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Update the effect state and transition progress
        updateEffectState();
        
        // Draw base static layer - either full redraw or partial
        if (config.usePartialRedraw) {
            drawPartialStatic();
        } else {
            drawFullStatic();
        }
        
        // Draw effect layer if needed
        if (config.effectState !== 'normal' && config.transitionProgress > 0) {
            drawEffectLayer();
        }
        
        // Request the next frame
        animationFrameId = requestAnimationFrame(drawStatic);
    }
    
    // Function to draw full static pattern (original approach but optimized)
    function drawFullStatic() {
        // Calculate number of static dots based on screen size with slight reduction
        const screenRatio = Math.min(1.0, (canvas.width * canvas.height) / (1920 * 1080));
        const baseStaticDots = Math.floor((canvas.width * canvas.height) / config.staticDivisor * config.density * screenRatio);
        
        // Batch draw by intensity for fewer state changes
        const dotsByIntensity = {};
        
        // Generate random dots and group by intensity
        for (let i = 0; i < baseStaticDots; i++) {
            const x = Math.floor(Math.random() * canvas.width);
            const y = Math.floor(Math.random() * canvas.height);
            
            // Use integer intensity values for better batching
            let intensity;
            if (isDarkMode) {
                intensity = Math.floor(config.darkIntensityMin + Math.random() * (config.darkIntensityMax - config.darkIntensityMin));
            } else {
                intensity = Math.floor(config.lightIntensityMin + Math.random() * (config.lightIntensityMax - config.lightIntensityMin));
            }
            
            const alpha = config.baseAlpha + (Math.random() - 0.5) * config.alphaVariance;
            
            // Group by intensity for batch rendering
            if (!dotsByIntensity[intensity]) {
                dotsByIntensity[intensity] = {
                    coords: [],
                    alpha: alpha
                };
            }
            
            dotsByIntensity[intensity].coords.push([x, y]);
        }
        
        // Draw each intensity group in a batch
        for (const intensity in dotsByIntensity) {
            const dots = dotsByIntensity[intensity];
            ctx.fillStyle = `rgba(${intensity}, ${intensity}, ${intensity}, ${dots.alpha})`;
            
            for (const [x, y] of dots.coords) {
                ctx.fillRect(x, y, config.pixelSize, config.pixelSize);
            }
        }
    }
    
    // Function for partial redraw of static (more efficient)
    function drawPartialStatic() {
        // If we don't have enough stored frames, create a new one
        if (staticPixels.length < config.maxStoredFrames) {
            // Generate a new frame of static
            const newFrame = generateStaticFrame();
            staticPixels.push(newFrame);
            
            // Draw all stored frames
            for (const frame of staticPixels) {
                drawStaticFrame(frame);
            }
        } else {
            // We have enough frames, so cycle them and update one
            // Remove oldest frame
            staticPixels.shift();
            
            // Generate new frame with partial coverage
            const partialFrame = generatePartialStaticFrame();
            staticPixels.push(partialFrame);
            
            // Draw all stored frames
            for (const frame of staticPixels) {
                drawStaticFrame(frame);
            }
        }
    }
    
    // Generate a full frame of static dots
    function generateStaticFrame() {
        // Calculate number of static dots with slight ratio applied for large screens
        const screenRatio = Math.min(1.0, (canvas.width * canvas.height) / (1920 * 1080));
        const dotsPerFrame = Math.floor((canvas.width * canvas.height) / config.staticDivisor * (config.density / config.maxStoredFrames) * screenRatio);
        
        // Group dots by intensity for efficient drawing
        const frameData = {};
        
        for (let i = 0; i < dotsPerFrame; i++) {
            const x = Math.floor(Math.random() * canvas.width);
            const y = Math.floor(Math.random() * canvas.height);
            
            // Use integer intensity values
            let intensity;
            if (isDarkMode) {
                intensity = Math.floor(config.darkIntensityMin + Math.random() * (config.darkIntensityMax - config.darkIntensityMin));
            } else {
                intensity = Math.floor(config.lightIntensityMin + Math.random() * (config.lightIntensityMax - config.lightIntensityMin));
            }
            
            const alpha = config.baseAlpha + (Math.random() - 0.5) * config.alphaVariance;
            
            // Ensure we have an entry for this intensity
            if (!frameData[intensity]) {
                frameData[intensity] = {
                    alpha: alpha,
                    pixels: []
                };
            }
            
            frameData[intensity].pixels.push([x, y]);
        }
        
        return frameData;
    }
    
    // Generate a partial frame for incremental updates
    function generatePartialStaticFrame() {
        // Calculate number of static dots based on the partial redraw ratio
        const screenRatio = Math.min(1.0, (canvas.width * canvas.height) / (1920 * 1080));
        const dotsPerPartialFrame = Math.floor(
            (canvas.width * canvas.height) / config.staticDivisor * 
            (config.density / config.maxStoredFrames) * 
            config.partialRedrawRatio * 
            screenRatio
        );
        
        // Group dots by intensity for efficient drawing
        const frameData = {};
        
        for (let i = 0; i < dotsPerPartialFrame; i++) {
            const x = Math.floor(Math.random() * canvas.width);
            const y = Math.floor(Math.random() * canvas.height);
            
            // Use integer intensity values
            let intensity;
            if (isDarkMode) {
                intensity = Math.floor(config.darkIntensityMin + Math.random() * (config.darkIntensityMax - config.darkIntensityMin));
            } else {
                intensity = Math.floor(config.lightIntensityMin + Math.random() * (config.lightIntensityMax - config.lightIntensityMin));
            }
            
            const alpha = config.baseAlpha + (Math.random() - 0.5) * config.alphaVariance;
            
            // Ensure we have an entry for this intensity
            if (!frameData[intensity]) {
                frameData[intensity] = {
                    alpha: alpha,
                    pixels: []
                };
            }
            
            frameData[intensity].pixels.push([x, y]);
        }
        
        return frameData;
    }
    
    // Draw a frame of static dots
    function drawStaticFrame(frameData) {
        // Draw each intensity group in a batch
        for (const intensity in frameData) {
            const group = frameData[intensity];
            ctx.fillStyle = `rgba(${intensity}, ${intensity}, ${intensity}, ${group.alpha})`;
            
            for (const [x, y] of group.pixels) {
                ctx.fillRect(x, y, config.pixelSize, config.pixelSize);
            }
        }
    }
    
    // Draw the effect layer (special effects, sparkles, etc.)
    function drawEffectLayer() {
        // Optimize effect layer drawing
        const screenRatio = Math.min(1.0, (canvas.width * canvas.height) / (1920 * 1080));
        
        // Draw fewer effect dots by using this multiplier
        const densityMultiplier = isDarkMode ? 60 : 50; // Higher values = fewer dots
        const maxEffectDots = Math.floor(
            (canvas.width * canvas.height) / densityMultiplier *
            (config.intenseDensity - config.density) * 
            config.transitionProgress * 
            screenRatio
        );

        // Limit maximum dots for very large screens
        const effectDots = Math.min(maxEffectDots, 7000); // Increased from 5000 to match higher density

        // Batch similar colors together to reduce state changes
        const effectColors = {
            purple: [],  // Main effect color
            cyan: [],    // Accent color
            white: []    // Sparkles
        };
        
        // Calculate dots and store positions by color
        for (let i = 0; i < effectDots; i++) {
            const x = Math.floor(Math.random() * canvas.width);
            const y = Math.floor(Math.random() * canvas.height);
            
            // Add some colorful variation
            const colorRoll = Math.random();
            
            // Determine dot type based on probability (keep original feel)
            if (colorRoll > (isDarkMode ? 0.93 : 0.9)) {
                effectColors.white.push([x, y]);
            } else if (colorRoll > (isDarkMode ? 0.9 : 0.85)) {
                effectColors.cyan.push([x, y]);
            } else {
                effectColors.purple.push([x, y]);
            }
        }
        
        // Draw main purple dots
        if (effectColors.purple.length > 0) {
            const colorIntensity = isDarkMode ? 0.85 : 1.0;
            const r = Math.floor(config.intenseColor[0] * colorIntensity);
            const g = Math.floor(config.intenseColor[1] * colorIntensity);
            const b = Math.floor(config.intenseColor[2] * colorIntensity);
            const baseAlpha = isDarkMode ? 0.75 : 0.9;
            const alpha = baseAlpha * config.transitionProgress;
            
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            
            for (const [x, y] of effectColors.purple) {
                // Keep 5% chance of larger dots for visual interest
                const dotSize = Math.random() > 0.95 ? 2 : 1;
                ctx.fillRect(x, y, dotSize, dotSize);
            }
        }
        
        // Draw cyan accent dots
        if (effectColors.cyan.length > 0) {
            const alpha = ((isDarkMode ? 0.6 : 0.8)) * config.transitionProgress;
            ctx.fillStyle = `rgba(150, 230, 255, ${alpha})`;
            
            for (const [x, y] of effectColors.cyan) {
                ctx.fillRect(x, y, config.pixelSize, config.pixelSize);
            }
        }
        
        // Draw white sparkles
        if (effectColors.white.length > 0) {
            const alpha = (isDarkMode ? 0.6 : 0.8) * config.transitionProgress;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            
            for (const [x, y] of effectColors.white) {
                // Keep white sparkles as 2px for visual pop
                ctx.fillRect(x, y, 2, 2);
            }
        }
    }
    
    // Helper function to update the effect state and transition progress
    function updateEffectState() {
        // Handle state transitions
        switch(config.effectState) {
            case 'intensifying':
                // Increase the transition progress
                config.transitionProgress += config.transitionSpeed;
                
                // If we've reached the maximum intensity
                if (config.transitionProgress >= 1) {
                    config.transitionProgress = 1;
                    config.effectState = 'intense'; // Switch to intense state
                }
                break;
                
            case 'fading':
                // Decrease the transition progress
                config.transitionProgress -= config.transitionSpeed;
                
                // If we've reached the normal state
                if (config.transitionProgress <= 0) {
                    config.transitionProgress = 0;
                    config.effectState = 'normal'; // Switch to normal state
                }
                break;
        }
        
        // Update the current parameters based on transition progress
        updateCurrentParameters();
    }
    
    // Helper function to update current parameters based on transition progress
    function updateCurrentParameters() {
        // Interpolate between normal and intense parameters with easing
        // Use a quadratic easing function for smoother transitions at beginning and end
        const easeInOut = config.transitionProgress < 0.5 ? 
            2 * config.transitionProgress * config.transitionProgress : 
            1 - Math.pow(-2 * config.transitionProgress + 2, 2) / 2;
            
        // Set minimum density to never go below 90% of normal density
        const minDensity = config.density * 0.9;
        
        // Calculate current density with easing and minimum
        config.currentDensity = Math.max(
            minDensity,
            config.density + (config.intenseDensity - config.density) * easeInOut
        );
            
        // Color mix can use the same easing for smooth transitions
        config.currentColorMix = easeInOut;
    }
    
    // Function to update the mode based on the media query
    function updateMode(event) {
        isDarkMode = event.matches;
        
        // Reset static pixels cache for new theme
        staticPixels = [];
    }
    
    // Function to trigger the intensifying effect (keep as-is for gemini-mascot.js)
    function enableMagicMode() {
        // Keep the background in the normal state
        config.effectState = 'normal';
        config.transitionProgress = 0;
    }
    
    // Function to trigger the fading effect (keep as-is for gemini-mascot.js)
    function disableMagicMode() {
        // Always ensure the background returns to/stays in the normal state
        config.effectState = 'normal';
        config.transitionProgress = 0;
    }

    // Initial Setup
    resizeCanvas(); // Set initial size

    // Event Listeners
    window.addEventListener('resize', resizeCanvas);

    // Initialize system to normal state
    config.effectState = 'normal';
    config.transitionProgress = 0;
    
    // Initialize current parameters (density, etc.)
    updateCurrentParameters();
    
    // Use performance data to adapt settings
    // This function is initially empty but will gather data as the animation runs
    let performanceData = {
        frameTimes: [],
        maxFrameTimes: 20, // Keep track of the last 20 frames
        slowFrameThreshold: 50, // ms, consider a frame "slow" if it takes more than this
        slowFrameCount: 0,
        adaptationThreshold: 5, // adapt after this many slow frames
        
        // Add a frame timing
        addFrameTime: function(duration) {
            this.frameTimes.push(duration);
            if (this.frameTimes.length > this.maxFrameTimes) {
                this.frameTimes.shift(); // Remove oldest
            }
            
            // Check if this was a slow frame
            if (duration > this.slowFrameThreshold) {
                this.slowFrameCount++;
                
                // If we've had too many slow frames, adapt
                if (this.slowFrameCount >= this.adaptationThreshold) {
                    this.adaptSettings();
                    this.slowFrameCount = 0; // Reset counter
                }
            }
        },
        
        // Adapt settings based on performance
        adaptSettings: function() {
            // Calculate average frame time
            const avgFrameTime = this.frameTimes.reduce((sum, time) => sum + time, 0) / this.frameTimes.length;
            
            // If average frame time is too high, reduce density
            if (avgFrameTime > this.slowFrameThreshold) {
                // Only adapt if density is still high
                if (config.density > 0.6) {
                    config.density *= 0.9; // Reduce by 10%
                    config.staticDivisor *= 1.1; // Increase divisor by 10%
                }
            }
        }
    };

    // Start the animation
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(drawStatic);
    
    // Expose functions to window for other scripts to use
    window.staticBackground = {
        enableMagicMode,    // Transition to intense state
        disableMagicMode,   // Transition back to normal state
        
        // Add some utility functions for direct state control if needed
        setIntense: function() {
            config.effectState = 'intense';
            config.transitionProgress = 1;
            updateCurrentParameters();
        },
        setNormal: function() {
            config.effectState = 'normal';
            config.transitionProgress = 0;
            updateCurrentParameters();
        }
    };

    // Listen for system theme changes
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeMediaQuery.addEventListener('change', updateMode);
     // Initialize isDarkMode based on current state
    isDarkMode = darkModeMediaQuery.matches;

    // Optional: Stop animation when tab is not visible (performance)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(animationFrameId);
        } else {
            // Restart the animation loop
            lastFrameTime = performance.now();
            animationFrameId = requestAnimationFrame(drawStatic);
        }
    });
    
    // Note: Magic mode is now explicitly controlled by gemini-mascot.js
    // so we've removed the automatic observer to avoid conflicts

}); // End DOMContentLoaded