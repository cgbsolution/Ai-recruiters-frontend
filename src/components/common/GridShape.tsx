import Image from "next/image";
import React from "react";

export default function GridShape() {
  return (
    <>
      <div className="absolute right-0 top-0 -z-1 w-full max-w-[250px] xl:max-w-[450px]">
        {/* The parent caps the width, so the height has to follow (h-auto) or
            the SVG is stretched — that mismatch is what Next warns about. This
            one is above the fold and gets picked as the LCP element, hence
            `priority`. */}
        <Image
          width={540}
          height={254}
          className="h-auto w-full"
          priority
          src="/images/shape/grid-01.svg"
          alt="grid"
        />
      </div>
      <div className="absolute bottom-0 left-0 -z-1 w-full max-w-[250px] rotate-180 xl:max-w-[450px]">
        <Image
          width={540}
          height={254}
          className="h-auto w-full"
          src="/images/shape/grid-01.svg"
          alt="grid"
        />
      </div>
    </>
  );
}
