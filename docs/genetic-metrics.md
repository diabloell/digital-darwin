# Genetic metrics and DD-02 experiments

The simulated organisms have four numeric inherited traits. Speed is cells/tick, sensing radius is cells, assimilation is a fraction of consumed food, and the birth threshold is in displayed energy units (1 unit = 1,000 quanta). Generation zero denotes founders.

## Live population

For each gene, DD-02 records the arithmetic mean, midpoint median, population variance (denominator N, squared gene units), and counts in eight equal-width bins spanning its allowed range. Interior bin boundaries belong to the upper bin and the last bin includes the maximum. Statistics for an extinct population are null and its count and number of variants are zero. A variant is an exact tuple of the four numeric alleles. Distinct tuples count equally even when their phenotypes are very similar. Generation mean and maximum describe the adults and newborns alive at sampling. Trajectories retain population and gene means at tick zero and every 100 ticks.

## Lifetime event totals

A changed birth has at least one allele that differs numerically from the parent. Mutation fraction divides changed births by all births. A clipped mutation can leave an allele unchanged. The number of births outside the original founder genotype set tracks novel inherited tuples relative to founders and can include repeated births with a previously observed novel tuple. Neonatal means are aggregated by generation of birth, with generation 32 onward grouped together. Generation zero is shown by the separate founder metrics.

For each trait, each world uses its own founder median to set the boundary between low (< median) and high (≥ median). As founder genomes are paired, the boundary is identical across conditions for a given seed. Entrants include founders and newborns. The end-of-run live fraction is (entrants − deaths) / entrants and is sensitive to age and arrival time. Parent births per 1,000 agent-ticks divide births credited to the parent's group by its exposure time, counting deaths in their last tick and excluding action time in the birth tick. These rates are descriptive. Correlated traits, environmental variation and shared ancestry affect their interpretation.

Energy quantities are recorded in integer quanta. The realized assimilation fraction is total assimilated / total consumed, including reserve cap losses. Metabolic dissipation and reproduction costs are separate sums. All ratios with zero denominator are null.

The observer retains founder genotypes (bounded by initial population), two counters per trait group, 33 generation groups, and accumulators. Engine event arrays retain only the last tick. The browser keeps up to 300 sampled rows. Headless experiments have fixed tick counts; the CLI samples at configured intervals.

## Design and control

The fixed seeds and conditions are declared in `apps/experiments.ts`. E01/E02 vary mutation rate and share a founder and food initialization. E02/E03 share founders and vary initial food and regrowth. E02/E04 share founders and mutation settings. In E04 all organisms express the same fixed phenotype, while genomes are transmitted and mutate as in E02. Genotypes therefore have no direct fitness effect in E04. Resulting demography and RNG trajectories can differ. Neutral alleles can still correlate with reproductive rates through lineage, spatial structure and chance. The control is not demographic matching or an inferential null test.

The output retains all replicas. Extinctions contribute zeros to population and variant counts, while undefined genetic summaries remain null. The per-condition and paired results report means and ranges, with no statistical significance threshold.
