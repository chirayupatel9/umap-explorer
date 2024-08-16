import React, { Component } from 'react';
import ReactLassoSelect, { getCanvas } from 'react-lasso-select';

class LassoSelector extends Component {
  constructor(props) {
    super(props);
    this.state = {
      points: [],
      clippedImg: null,
      canvasSrc: null,
    };
    this.canvasRef = React.createRef();
  }

  componentDidMount() {
    this.drawEmbeddings();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.embeddings !== this.props.embeddings) {
      this.drawEmbeddings();
    }
  }

  drawEmbeddings = () => {
    const { embeddings } = this.props;
    if (!embeddings) {
      console.error('Embeddings are undefined.');
      return;
    }
    const canvas = this.canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each point from embeddings
    embeddings.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x + canvas.width / 2, y + canvas.height / 2, 2, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'blue';
      ctx.fill();
      ctx.closePath();
    });

    const canvasSrc = canvas.toDataURL();
    this.setState({ canvasSrc });
  }

  handleChange = (value) => {
    this.setState({ points: value });
  };

  handleComplete = (value) => {
    if (!value.length) return;
    const { canvasSrc } = this.state;
    getCanvas(canvasSrc, value, (err, canvas) => {
      if (!err) {
        this.setState({ clippedImg: canvas.toDataURL() });
      }
    });
  };

  render() {
    const { canvasSrc, points, clippedImg } = this.state;

    return (
      <div className="App">
        <canvas ref={this.canvasRef} width={500} height={500} />
        {canvasSrc && (
          <ReactLassoSelect
            value={points}
            src={canvasSrc}
            onChange={this.handleChange}
            onComplete={this.handleComplete}
          />
        )}
        <div>Points: {points.map(({ x, y }) => `${x},${y}`).join(" ")}</div>
        <div>
          {clippedImg && <img src={clippedImg} alt="Clipped" />}
        </div>
      </div>
    );
  }
}

export default LassoSelector;
