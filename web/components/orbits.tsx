/** Akasa's navy-band motif: thin teal/cyan orbit rings and a coral dot. */
export function Orbits() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="orbit top-[-140px] right-[-120px] h-[520px] w-[520px] border border-teal/30" />
      <div className="orbit top-[-40px] right-[-20px] h-[320px] w-[320px] border border-cyan/35" />
      <div className="orbit top-[118px] right-[288px] h-3.5 w-3.5 bg-coral" />
      <div className="orbit bottom-[-260px] left-[-180px] h-[480px] w-[480px] border border-teal/15" />
    </div>
  );
}
