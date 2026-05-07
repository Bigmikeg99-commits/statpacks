"use client";
import { useState } from "react";
import Image from "next/image";

type TradingCardProps = {
  pick: any;
};

export default function TradingCard({ pick }: TradingCardProps) {
  const [flipped, setFlipped] = useState(false);
  const isOver = pick.rec === "OVER";
  const posLetter = pick.hand === "L" ? "LHP" : "RHP";

  const imgUrl = pick.mlbamid
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${pick.mlbamid}/headshot/67/current`
    : "";

  return (
    <div
      className="w-[240px] h-[430px] cursor-pointer flex-shrink-0 perspective-[1200px]"
      onClick={() => setFlipped(!flipped)}
    >
      <div className={`relative w-full h-full transition-transform duration-700 preserve-3d ${flipped ? "rotate-y-180" : ""}`}>
        {/* FRONT */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-white/5 backdrop-blur-xl flex flex-col">
          {/* Photo */}
          <div className="relative flex-1">
            {imgUrl ? (
              <Image src={imgUrl} alt={pick.name} fill className="object-cover" sizes="240px" />
            ) : (
              <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-6xl text-white/10">?</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
          </div>

          {/* Top Left */}
          <div className="absolute top-4 left-4 text-white/90 text-xs tracking-widest">SP</div>

          {/* Side Tag */}
          <div className="absolute right-4 top-32 -rotate-90 text-white/70 text-xs font-bold tracking-widest">{posLetter}</div>

          {/* Recommendation Badge */}
          <div className={`absolute top-4 right-4 px-3 py-1 text-xs font-bold rounded text-white ${isOver ? "bg-blue-500" : "bg-red-600"}`}>
            {pick.rec} {pick.line}K
          </div>

          {/* Bottom Nameplate */}
          <div className="h-[28%] bg-black/90 px-5 flex items-center">
            <div>
              <div className="text-white text-xl font-semibold">{pick.name}</div>
              <div className="text-white/70 text-xs tracking-widest">NEW YORK YANKEES</div>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-zinc-950 rotate-y-180 flex items-center justify-center">
          <div className="text-center">
            <div className="text-amber-400 font-bold">STATS + SHAP</div>
            <div className="text-xs text-white/60 mt-2">Back side coming soon</div>
          </div>
        </div>
      </div>
    </div>
  );
}