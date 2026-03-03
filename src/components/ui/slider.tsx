"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  />
));
Slider.displayName = SliderPrimitive.Root.displayName;

const SliderTrack = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Track>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Track>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Track
    ref={ref}
    className={cn(
      "relative h-2 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700",
      className
    )}
    {...props}
  />
));
SliderTrack.displayName = SliderPrimitive.Track.displayName;

const SliderRange = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Range>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Range>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Range
    ref={ref}
    className={cn("absolute h-full bg-blue-600", className)}
    {...props}
  />
));
SliderRange.displayName = SliderPrimitive.Range.displayName;

interface ThumbProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb> {
  value?: number;
}

const SliderThumb = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Thumb>,
  ThumbProps
>(({ className, value, ...props }, ref) => (
  <Tooltip.Provider delayDuration={0}>
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <SliderPrimitive.Thumb
          ref={ref}
          className={cn(
            "block h-4 w-4 rounded-full border-2 border-blue-600 bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400",
            className
          )}
          {...props}
        />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          className="bg-blue-600 text-white text-xs px-2 py-1 rounded-md shadow-md"
        >
          {value}
          <Tooltip.Arrow className="fill-blue-600" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>
));
SliderThumb.displayName = SliderPrimitive.Thumb.displayName;

export { Slider, SliderTrack, SliderRange, SliderThumb };
