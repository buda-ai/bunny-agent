"use client";

import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";

export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <ScrollArea className="w-full overflow-x-auto pb-2" {...props}>
    <div
      className={cn("flex w-max flex-nowrap items-start gap-2 pb-1", className)}
    >
      {children}
    </div>
    <ScrollBar orientation="horizontal" className="h-2" />
  </ScrollArea>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = () => {
    onClick?.(suggestion);
  };

  return (
    <Button
      className={cn(
        // Layout & spacing
        "cursor-pointer rounded-full px-4 py-2",
        // Size constraints - max-w-xs (20rem/320px) allows ~20 characters before wrapping
        "max-w-xs min-h-8 h-auto",
        // Text styling
        "whitespace-normal text-left",
        className,
      )}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
