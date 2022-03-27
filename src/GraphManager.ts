import {getLogger} from './util/Log4javascriptFacade';
import * as d3 from 'd3';
import dayjs from 'dayjs';

interface MyEntry {
  time: Date;
  powerGrid: number;
  stateOfCharge: number;
}

export interface PathData {
  time: Date;
  value?: number;
}

export interface PathOptions {
  name: string;
  label?: string;
  color?: string;
  yAxis?: 'y' | 'y2';
}

interface PathEntry {
  options: PathOptions;
  pathData: PathData[];
}

// try? https://github.com/Lemoncode/d3js-typescript-examples
export class GraphManager {
  private readonly logger = getLogger('GraphManager');

  private newRun = true;

  private svg: any;
  private x: any;
  private y: any;
  private y2: any;
  private tooltip: any;

  private xAxis: any;
  private yAxis: any;
  private brush: any;
  private idleTimeout: number | null;

  private dataSetCounter: number;

  private entries: PathEntry[] = [];

  constructor() {
    this.logger.info('constructor()');
    this.dataSetCounter = 0;
  }

  // gridlines in x axis function
  private make_x_gridlines(x: any, ticks = 12) {
    return d3.axisBottom<Date>(x).ticks(ticks).tickFormat(d3.timeFormat(''));
  }

  // gridlines in y axis function
  private make_y_gridlines(y: any) {
    return d3.axisLeft<number>(y).ticks(10).tickFormat('');
  }

  createBaseDiagram(from: Date, to: Date): void {
    this.logger.debug('createBaseDiagram()');

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    const diffHours = dayjs(to).diff(dayjs(from), 'hour');

    // clear old svgs
    d3.selectAll('#myGraphs > svg').remove();

    this.dataSetCounter = 0;

    // set the dimensions and margins of the graph
    const margin = {top: 10, right: 35, bottom: 30, left: 40};

    let baseHeight = 700;
    // check if baseHeight + margin and fieldset/div space if fine for the screen
    baseHeight = baseHeight + 100 > window.innerHeight ? window.innerHeight - 50 : baseHeight;

    // TODO check if margin is needed here, it's added later
    const width = window.innerWidth - 70 - margin.left - margin.right;
    const height = baseHeight - margin.top - margin.bottom;

    // append the svg object to the body of the page
    this.svg = d3
      .select('#myGraphs')
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    // .on('pointerenter pointermove', this.pointermoved.bind(this))
    // .on('pointerleave', this.pointerleft.bind(this))

    // Add X axis --> it is a date format
    this.x = d3
      .scaleTime()
      .domain(<[Date, Date]>[from, to])
      .range([0, width]);

    this.xAxis = this.svg
      .append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom<Date>(that.x).tickFormat(d3.timeFormat('%d.%m %H:%M')));

    // Add Y axis
    this.y = d3
      .scaleLinear()
      .domain([0, 10100])
      // .domain([0, 3100])
      // .domain(
      //   <[number, number]>d3.extent(data, function (d) {
      //     return d.powerGrid;
      //   })
      // )
      .range([height, 0]);
    this.yAxis = this.svg.append('g').call(d3.axisLeft(that.y));

    // Add 2. Y axis
    this.y2 = d3.scaleLinear().domain([0, 1.01]).range([height, 0]);
    // this.y2 = d3.scaleLinear().domain([0, 1.03]).range([height, 0]);

    // TODO this.yAxis2
    this.svg
      .append('g')
      .attr('transform', 'translate( ' + width + ', 0 )')
      .call(d3.axisRight(that.y2).tickFormat(d3.format('~%')));

    // add the X gridlines
    this.svg
      .append('g')
      .attr('class', 'grid')
      .attr('transform', 'translate(0,' + height + ')')
      .call(this.make_x_gridlines(that.x, diffHours).tickSize(-height));
    // .call(this.make_x_gridlines().tickSize(-height).tickFormat(""));

    // add the Y gridlines
    this.svg.append('g').attr('class', 'grid').call(this.make_y_gridlines(that.y).tickSize(-width));

    // Add a clipPath: everything out of this area won't be drawn.
    const clip = this.svg
      .append('defs')
      .append('svg:clipPath')
      .attr('id', 'clip')
      .append('svg:rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height);

    // this.tooltip = this.svg.append('g').style('pointer-events', 'none');

    // this.tooltip = this.svg
    //   .append('text')
    //   .attr('x', width - 200)
    //   .attr('y', 50)
    //   .text('---my label---')
    //   .style('font-size', '16px')
    //   .style('stroke', 'black')
    //   .attr('class', 'myTooltip')
    //   .style('stroke-width', 1)
    //   .append('tspan')
    //   .attr('x', width - 200)
    //   .attr('dy', '1em')
    //   .text('line 1');

    // d3.select('body').append('div').attr('id', 'tooltip').attr('style', 'position: absolute; opacity: 0;');

    // // CREATE HOVER TOOLTIP WITH VERTICAL LINE //
    // const tooltip = d3
    //   .select('#chart')
    //   .append('div')
    //   .attr('id', 'tooltip')
    //   .style('position', 'absolute')
    //   .style('background-color', '#D3D3D3')
    //   .style('padding', 6)
    //   .style('display', 'none');

    // const mouseG = this.svg.append('g').attr('class', 'mouse-over-effects');

    // mouseG
    //   .append('path') // create vertical line to follow mouse
    //   .attr('class', 'mouse-line')
    //   .style('stroke', '#A9A9A9')
    //   .style('stroke-width', 5)
    //   .style('opacity', '0');

    // // Add brushing
    // this.brush = d3
    //   .brushX() // Add the brush feature using the d3.brush function
    //   .extent([
    //     [0, 0],
    //     [width, height]
    //   ]) // initialise the brush area: start at 0,0 and finishes at width,height: it means I select the whole graph area
    //   .on('end', this.updateChart); // Each time the brush selection changes, trigger the 'updateChart' function
  }

  updateChart(event: any, d: any): void {
    // What are the selected boundaries?
    const extent = event.selection;

    const that = this;
    // If no selection, back to initial coordinate. Otherwise, update X axis domain
    if (!extent) {
      if (!this.idleTimeout) {
        // This allows to wait a little bit
        this.idleTimeout = setTimeout(() => {
          that.idleTimeout = null;
        }, 350);
        return;
      }
      this.x.domain([4, 8]);
    } else {
      this.x.domain([this.x.invert(extent[0]), this.x.invert(extent[1])]);
      // line.select('.brush').call(this.brush.move, null); // This remove the grey brush area as soon as the selection has been done
    }
  }

  public addGraph(options: PathOptions, data: PathData[]): void {
    this.entries.push({
      options: options,
      pathData: data
    });

    const name = options.name;
    const label = options.label ? options.label : options.name;
    const color = options.color ? options.color : 'black';
    let yAxis = this.y;
    if (options.yAxis === 'y2') {
      yAxis = this.y2;
    }
    this.createPath(name, label, color, data, this.svg, yAxis);
  }

  private createPath(name: string, label: string, color: string, data: PathData[], svg: any, yAxis: any): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    // legend icon (circle)
    const offset = this.dataSetCounter++ * 30;
    svg
      .append('circle')
      .attr('cx', 15)
      .attr('cy', 20 + offset)
      .attr('r', 6)
      .attr('class', name)
      .style('stroke', color)
      .style('fill', color)
      .on('click', function () {
        document.querySelector('circle.' + name)?.classList.toggle('fillNone');
        document.querySelector('path.' + name)?.classList.toggle('hidden');
      })
      .on('mouseenter', function () {
        document.querySelector('text.' + name)?.classList.add('highlight');
        document.querySelector('path.' + name)?.classList.add('highlight');
      })
      .on('mouseout', function () {
        document.querySelector('text.' + name)?.classList.remove('highlight');
        document.querySelector('path.' + name)?.classList.remove('highlight');
      });

    // legend text
    svg
      .append('text')
      .attr('x', 35)
      .attr('y', 20 + offset)
      .text(label)
      .style('font-size', '16px')
      .style('fill', color)
      .attr('class', name)
      .attr('alignment-baseline', 'middle')
      .on('click', function () {
        document.querySelector('circle.' + name)?.classList.toggle('fillNone');
        document.querySelector('path.' + name)?.classList.toggle('hidden');
      })
      .on('mouseenter', function () {
        document.querySelector('text.' + name)?.classList.add('highlight');
        document.querySelector('path.' + name)?.classList.add('highlight');
      })
      .on('mouseout', function () {
        document.querySelector('text.' + name)?.classList.remove('highlight');
        document.querySelector('path.' + name)?.classList.remove('highlight');
      });

    // Add line
    const line = svg.append('g').attr('clip-path', 'url(#clip)');

    line
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      // .attr('fill', color)
      // .style('fill-opacity', 0.1)
      .attr('stroke', color)
      // .style('stroke-dasharray', '10,3')
      .attr('stroke-width', 1.5)
      .attr('class', `myLine ${name}`)
      // .attr('stroke', color)
      .attr(
        'd',
        d3
          .line<PathData>()
          .x(function (d: PathData) {
            return that.x(d.time);
          })
          .y(function (d: PathData) {
            return yAxis(d.value);
          })
          .defined(function (d: PathData) {
            return d.value ? true : false;
          })
      );

    // Add the brushing
    // line.append('g').attr('class', 'brush').call(this.brush);
  }

  // public pointermoved(event: any) {
  //   console.log('pointermoved()');

  //   const date = this.x.invert(d3.pointer(event)[0]);

  //   const X = d3.map(this.entries[0].pathData, d => d.time);
  //   const i = d3.bisectCenter(X, date);

  //   const formatted = dayjs(date).format('HH:mm - ' + i);
  //   console.log('formatted', formatted);

  //   d3.select('text.myTooltip').remove();

  //   const text = this.svg
  //     .append('text')
  //     .attr('x', 200)
  //     .attr('y', 50)
  //     .text('---my label---')
  //     .style('font-size', '16px')
  //     .style('stroke', 'black')
  //     .attr('class', 'myTooltip')
  //     .style('stroke-width', 1);

  //   this.entries.forEach(entry => {
  //     const zzz = this.getCurrentEntry(date, entry);
  //     console.log(zzz);
  //     text.append('tspan').attr('x', 200).attr('dy', '1em').text(`${zzz.name}: ${zzz.value}`);
  //   });
  // }

  // public pointerleft(): void {
  //   // console.log('pointerleft');
  // }

  // private getCurrentEntry(timestamp: Date, entries: PathEntry) {
  //   const options = entries.options;
  //   const pathData = entries.pathData;

  //   const timestampString = dayjs(timestamp).format('HH');

  //   const entry4Timestamp = pathData.filter(entry => {
  //     return dayjs(entry.time).format('HH') === timestampString;
  //   });

  //   return {
  //     name: options.name,
  //     value: entry4Timestamp[0]?.value
  //   };
  // }
}
