<template>
  <div id="barChart" :class="$mq">
    <h3 class="label">{{ $t('barChart.label') }}</h3>
    <svg ref="svg" :width="width" :height="height">
      <g class="label axis" ref="yAxis" :transform="`translate(${margin.left}, 0)`" />
      <g v-for="d in bars" v-if="d.height" :key="d.id" :transform="`translate(${d.x}, ${d.y})`">
        <rect :width="barWidth" :height="d.height" :fill="d.color" opacity="0.75" />
        <line :x2="barWidth" :stroke="d.color" :stroke-width="2" />
      </g>
      <g class="label axis" ref="xAxis" :transform="`translate(0, ${height - margin.bottom})`" />
    </svg>
  </div>
</template>

<script>
import * as d3 from 'd3'
import _ from 'lodash'

const healthStatus = [2, 3, 4, 5]
const margin = { top: 12, right: 0, bottom: 20, left: 20 }
export default {
  name: 'BarChart',
  props: [
    'isPhone',
    'height',
    'ageGroups',
    'colorsByHealth',
    'tl',
    'phases',
    'playTimeline',
  ],
  data() {
    return {
      width: null,
      margin,
      bars: [],
      barWidth: 0,
    }
  },
  created() {
    this.stackGenerator = d3
      .stack()
      .keys(healthStatus)
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone)

    this.xScale = d3.scaleBand()
      .domain(_.values(this.ageGroups))
    this.yScale = d3.scaleLinear()
      .range([this.height - margin.bottom, margin.top])

    this.xAxis = d3
      .axisBottom()
      .scale(this.xScale)
      .tickSizeOuter(0)
    this.yAxis = d3
      .axisLeft()
      .scale(this.yScale)
      .ticks(this.isPhone ? 2 : 4)
      .tickSizeOuter(0)
      .tickFormat(d => (d >= 1000 ? `${_.round(d / 1000, 1)}k` : d))
  },
  mounted() {
    this.calculateDimensions()
    this.startBarChart()
    this.updateBarChart()
    this.animateBarChart()
  },
  computed: {
    day() {
      return this.$store.state.day
    },
    population() {
      return this.$store.getters.population
    },
    people() {
      return (
        this.$store.getters.community && this.$store.getters.community.people
      )
    },
    infected() {
      return this.$store.getters.infected
    },
  },
  watch: {
    day() {
      if (this.day === 1) {
        this.startBarChart()
      }
    },
    people() {
      this.calculateDimensions()
      this.startBarChart()
    },
    infected() {
      this.calculateDimensions()
      this.updateBarChart()
      this.animateBarChart()
    },
  },
  methods: {
    calculateDimensions() {
      const {width} = this.$refs.svg.getBoundingClientRect()
      if (!width) return

      Object.assign(this.$data, {width})

      this.xScale.range([margin.left, this.width - margin.right])
        .padding(this.width > 300 ? 0.55 : 0.45)
      this.barWidth = this.xScale.bandwidth()

      this.yAxis.tickSizeInner(-this.width + margin.left + margin.right)
    },
    startBarChart() {
      if (!this.people) return
      // create bars so that can animate later
      // outer array is health status, inner is age groups
      this.bars = _.chain(healthStatus)
        .map(health => {
          return _.chain(this.people)
            .groupBy('ageGroup')
            .map((people, age) => {
              const ageGroup = this.ageGroups[age]
              return {
                id: `${health}-${ageGroup}`,
                x: this.xScale(ageGroup),
                y: this.yScale(0),
                height: 0,
                color: this.colorsByHealth[health],
              }
            })
            .value()
        })
        .flatten()
        .value()
    },
    updateBarChart() {
      if (!this.infected) return

      const healthByAge = _.chain(this.people)
        .groupBy('ageGroup')
        .map((people, age) => {
          const healths = Object.assign(
            { ageGroup: this.ageGroups[age]},
            _.reduce(healthStatus, (obj, health) => {
              obj[health] = 0
              return obj
            }, {})
          )
          _.each(people, ({index}) => {
            const health = this.infected[index].health
            if (_.includes(healthStatus, health)) {
              healths[health] += 1
            }
          })
          return healths
        })
        .value()

      const stacks = this.stackGenerator(healthByAge)
      this.yScale.domain([0, d3.max(_.flatten(stacks), d => d[1])])
      this.nextBarsById = _.chain(stacks)
        .map(stack => {
          return _.map(stack, d => {
            let [y1, y2] = d
            return {
              id: `${stack.key}-${d.data.ageGroup}`,
              x: this.xScale(d.data.ageGroup),
              y: this.yScale(y2),
              height: this.yScale(y1) - this.yScale(y2),
            }
          })
        })
        .flatten()
        .keyBy('id')
        .value()
    },
    animateBarChart() {
      if (!this.infected) return

      if (this.tl) {
        // set up gsap animation
        this.tl.to(
          this.bars,
          {
            x: (i, { id }) => this.nextBarsById[id].x,
            y: (i, { id }) => this.nextBarsById[id].y,
            height: (i, { id }) => this.nextBarsById[id].height,
            duration: this.phases[1] / 2,
          },
          `day${this.day}-1`
        )
        // and at same time update scales
        this.tl.add(() => {
          d3.select(this.$refs.xAxis)
            .transition()
            .call(this.xAxis)
          d3.select(this.$refs.yAxis)
            .transition()
            .on('start', this.formatYAxis)
            .call(this.yAxis)
        }, `day${this.day}-1`)

        this.playTimeline('bar')
      } else {
        _.each(this.bars, d =>
          Object.assign(d, {
            x: this.nextBarsById[d.id].x,
            y: this.nextBarsById[d.id].y,
            height: this.nextBarsById[d.id].height,
          })
        )
        d3.select(this.$refs.xAxis).call(this.xAxis)
        d3.select(this.$refs.yAxis).call(this.yAxis)
        this.formatYAxis(null, null, [this.$refs.yAxis])
      }
    },
    formatYAxis(d, i, nodes) {
      const container = d3.select(nodes[0])
      container.select('path').remove()
      container
        .selectAll('g')
        .filter(d => !_.isInteger(d))
        .remove()
      container
        .selectAll('line')
        .attr('stroke-dasharray', '5')
        .attr('stroke', '#cfcfcf')
        .attr('shape-rendering', 'crispEdges')
    },
  },
}
</script>

<style lang="scss" scoped>
#barChart {
  width: 100%;
  display: inline-block;
}

h3 {
  text-align: left;
}

svg {
  width: 100%;
  overflow: visible;
}

.axis {
  font-size: 10px;
}

.sm {
  padding: 0.5rem 0.75rem;
  border-top: 1px solid $gray;
}
</style>
