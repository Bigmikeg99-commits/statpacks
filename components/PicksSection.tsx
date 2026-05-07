import TradingCard from "./TradingCard";

const samplePicks = [
  { name: "Jack Leiter", mlbamid: "683004", rec: "UNDER", line: 5.5, hand: "R" },
  { name: "Anthony Kay", mlbamid: "641743", rec: "OVER", line: 3.5, hand: "L" },
  { name: "Luis Castillo", mlbamid: "622491", rec: "UNDER", line: 4.5, hand: "R" },
];

export default function PicksSection() {
  return (
    <div className="py-12 bg-[#0a1420]">
      <div className="max-w-[1280px] mx-auto px-8">
        <div className="flex gap-8 justify-center">
          {samplePicks.map((pick, i) => (
            <TradingCard key={i} pick={pick} />
          ))}
        </div>
      </div>
    </div>
  );
}