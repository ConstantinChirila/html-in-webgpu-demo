const canvas = document.querySelector("#scene");
const card = document.querySelector("#card");
const cardCopy = document.querySelector("#card-copy");
const wobble = document.querySelector("#wobble");
const changeButton = document.querySelector("#change");
const status = document.querySelector("#status");

function fail(message) {
  status.textContent = message;
  status.dataset.error = "true";
  throw new Error(message);
}

if (!navigator.gpu) {
  fail("WebGPU is not available in this browser.");
}

if (!("requestPaint" in HTMLCanvasElement.prototype)) {
  fail(
    "HTML in Canvas is not enabled. Use Chrome Canary and enable the two flags listed in the README."
  );
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  fail("Chrome could not get a WebGPU adapter.");
}

const device = await adapter.requestDevice();

if (!("drawElementImageToTexture" in device.queue)) {
  fail(
    "This Chromium build does not expose drawElementImageToTexture(). Check the README and make sure Canary is up to date."
  );
}

const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format,
  alphaMode: "premultiplied",
});

const shader = device.createShaderModule({
  code: `
    struct Uniforms {
      time: f32,
      strength: f32,
      scaleX: f32,
      scaleY: f32,
    }

    @group(0) @binding(0)
    var domTexture: texture_2d<f32>;

    @group(0) @binding(1)
    var domSampler: sampler;

    @group(0) @binding(2)
    var<uniform> uniforms: Uniforms;

    struct VertexOut {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    }

    @vertex
    fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
      var positions = array<vec2f, 6>(
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
        vec2f(-1.0,  1.0),
        vec2f(-1.0,  1.0),
        vec2f( 1.0, -1.0),
        vec2f( 1.0,  1.0)
      );

      let p = positions[index];

      var out: VertexOut;
      out.position = vec4f(
        p.x * uniforms.scaleX,
        p.y * uniforms.scaleY,
        0.0,
        1.0
      );

      out.uv = vec2f(
        (p.x + 1.0) * 0.5,
        1.0 - ((p.y + 1.0) * 0.5)
      );

      return out;
    }

    @fragment
    fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
      var uv = input.uv;

      let wave =
        sin(uv.y * 16.0 + uniforms.time * 2.4) *
        uniforms.strength;

      uv.x += wave;

      if (
        uv.x < 0.0 || uv.x > 1.0 ||
        uv.y < 0.0 || uv.y > 1.0
      ) {
        discard;
      }

      return textureSample(domTexture, domSampler, uv);
    }
  `,
});

const pipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: {
    module: shader,
    entryPoint: "vertexMain",
  },
  fragment: {
    module: shader,
    entryPoint: "fragmentMain",
    targets: [{ format }],
  },
  primitive: {
    topology: "triangle-list",
  },
});

const sampler = device.createSampler({
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge",
});

const uniformBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

let domTexture;
let bindGroup;
let textureWidth = 1;
let textureHeight = 1;
let cardWidth = 1;
let cardHeight = 1;

function destroyTexture() {
  domTexture?.destroy();
  domTexture = undefined;
}

function makeDOMTexture() {
  destroyTexture();

  const rect = card.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  cardWidth = rect.width;
  cardHeight = rect.height;

  textureWidth = Math.max(1, Math.ceil(cardWidth * dpr));
  textureHeight = Math.max(1, Math.ceil(cardHeight * dpr));

  domTexture = device.createTexture({
    size: [textureWidth, textureHeight, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: domTexture.createView(),
      },
      {
        binding: 1,
        resource: sampler,
      },
      {
        binding: 2,
        resource: {
          buffer: uniformBuffer,
        },
      },
    ],
  });
}

function copyDOMToTexture() {
  const rect = card.getBoundingClientRect();

  // Recreate the texture if a DOM change altered the card's size.
  const dpr = window.devicePixelRatio || 1;
  const expectedWidth = Math.max(1, Math.ceil(rect.width * dpr));
  const expectedHeight = Math.max(1, Math.ceil(rect.height * dpr));

  if (
    !domTexture ||
    expectedWidth !== textureWidth ||
    expectedHeight !== textureHeight
  ) {
    makeDOMTexture();
  }

  device.queue.drawElementImageToTexture(
    {
      source: card,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: rect.width,
      sourceHeight: rect.height,
    },
    {
      texture: domTexture,
      size: {
        width: textureWidth,
        height: textureHeight,
      },
    }
  );

  /*
    WebGPU knows where the texture is drawn. The DOM does not.

    We give Chrome the base, undistorted rectangle so accessibility geometry
    has a useful location. The shader wobble itself cannot be represented by
    one DOMMatrix, which is part of the point of the demo.
  */
  const target = getTargetRect();

  canvas.updateElementGeometry(card, {
    canvasTransform: new DOMMatrix()
      .translate(target.x, target.y)
      .scale(
        target.width / rect.width,
        target.height / rect.height
      ),
  });
}

function getTargetRect() {
  const maxWidth = canvas.clientWidth * 0.72;
  const maxHeight = canvas.clientHeight * 0.62;

  const scale = Math.min(
    maxWidth / cardWidth,
    maxHeight / cardHeight,
    1.25
  );

  const width = cardWidth * scale;
  const height = cardHeight * scale;

  return {
    x: (canvas.clientWidth - width) / 2,
    y: (canvas.clientHeight - height) / 2,
    width,
    height,
  };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  canvas.requestPaint();
}

canvas.addEventListener("paint", () => {
  copyDOMToTexture();
});

new ResizeObserver(resizeCanvas).observe(canvas);

let alternate = false;

changeButton.addEventListener("click", () => {
  alternate = !alternate;

  card.classList.toggle("alt", alternate);
  cardCopy.textContent = alternate
    ? "The DOM changed. Chrome recorded a new snapshot."
    : "DevTools sees an article. WebGPU sees pixels.";

  // DOM changes should cause a paint event on their own, but asking for one
  // makes the demo's intent explicit.
  canvas.requestPaint();
});

const start = performance.now();

function render(now) {
  if (!bindGroup) {
    requestAnimationFrame(render);
    return;
  }

  const target = getTargetRect();
  const scaleX = target.width / canvas.clientWidth;
  const scaleY = target.height / canvas.clientHeight;

  device.queue.writeBuffer(
    uniformBuffer,
    0,
    new Float32Array([
      (now - start) / 1000,
      Number(wobble.value),
      scaleX,
      scaleY,
    ])
  );

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: {
          r: 0.082,
          g: 0.082,
          b: 0.074,
          a: 1,
        },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(render);
}

resizeCanvas();
canvas.requestPaint();
requestAnimationFrame(render);

status.textContent =
  "Real DOM → drawable snapshot → WebGPU texture → shader";
