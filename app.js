(function () {
  'use strict';

  var MOCK = {
    connectionString: 'redis://default:ak9xY2mN2pQ7sL4v@redis-abc123.redis.cloud:12345',
    connectionStringMasked: 'redis://default:••••••••@redis-abc123.redis.cloud:12345',
    host: 'redis-abc123.redis.cloud',
    port: '12345',
    password: 'ak9xY2mN2pQ7sL4v',
    envVars: [
      'REDIS_URL=redis://default:ak9xY2mN2pQ7sL4v@redis-abc123.redis.cloud:12345',
      'REDIS_HOST=redis-abc123.redis.cloud',
      'REDIS_PORT=12345',
      'REDIS_PASSWORD=ak9xY2mN2pQ7sL4v'
    ],
    envVarsMasked: [
      'REDIS_URL=redis://default:••••••••@redis-abc123.redis.cloud:12345',
      'REDIS_HOST=redis-abc123.redis.cloud',
      'REDIS_PORT=12345',
      'REDIS_PASSWORD=••••••••'
    ],
    cliCommand: 'redis-cli -h redis-abc123.redis.cloud -p 12345 -a ak9xY2mN2pQ7sL4v',
    cliCommandMasked: 'redis-cli -h redis-abc123.redis.cloud -p 12345 -a ••••••••',
    sdk: {
      node: "const redis = require('redis');\nconst client = redis.createClient({\n  url: 'redis://default:<password>@redis-abc123.redis.cloud:12345'\n});\nawait client.connect();\nconsole.log(await client.ping());",
      python: "import redis\n\nr = redis.Redis(\n  host='redis-abc123.redis.cloud',\n  port=12345,\n  password='<password>',\n  decode_responses=True\n)\nprint(r.ping())",
      dotnet: "using StackExchange.Redis;\n\nvar mux = ConnectionMultiplexer.Connect(\n  \"redis-abc123.redis.cloud:12345,password=<password>\"\n);\nvar db = mux.GetDatabase();\nConsole.WriteLine(db.Ping());",
      java: "import redis.clients.jedis.Jedis;\n\nJedis jedis = new Jedis(\n  \"redis-abc123.redis.cloud\", 12345\n);\njedis.auth(\"<password>\");\nSystem.out.println(jedis.ping());",
      go: "package main\n\nimport (\n  \"context\"\n  \"fmt\"\n  \"github.com/redis/go-redis/v9\"\n)\n\nfunc main() {\n  rdb := redis.NewClient(&redis.Options{\n    Addr:     \"redis-abc123.redis.cloud:12345\",\n    Password: \"<password>\",\n  })\n  fmt.Println(rdb.Ping(context.Background()))\n}",
      php: "require 'vendor/autoload.php';\n\n$client = new Predis\\Client([\n  'scheme' => 'tcp',\n  'host'   => 'redis-abc123.redis.cloud',\n  'port'   => 12345,\n  'password' => '<password>',\n]);\necho $client->ping();"
    }
  };

  var DUPLICATE_NAMES = ['existing-db', 'mydb', 'cache'];
  var UNAVAILABLE_REGION = 'ap-southeast-1';
  var NAME_REGEX = /^[a-zA-Z0-9_-]*$/;
  var NAME_MIN = 3;
  var NAME_MAX = 64;
  var FAIL_CREATE_NAMES = ['fail', 'error'];

  // Pricing tables (from redis.io/pricing)
  var RAM_SIZES = [
    { label: '250 MB', value: '0.25', dataset: '250 MB', ops: 1000,  price: 5 },
    { label: '1 GB',   value: '1',    dataset: '1 GB',   ops: 1000,  price: 7 },
    { label: '2.5 GB', value: '2.5',  dataset: '2.5 GB', ops: 1000,  price: 15 },
    { label: '5 GB',   value: '5',    dataset: '5 GB',   ops: 1000,  price: 30 },
    { label: '12 GB',  value: '12',   dataset: '12 GB',  ops: 1000,  price: 60 }
  ];

  var FLEX_SIZES = [
    { label: '1 GB',   value: '1',    dataset: '512 MB', ops: 200,   price: 6 },
    { label: '2.5 GB', value: '2.5',  dataset: '1.25 GB', ops: 500,  price: 14 },
    { label: '5 GB',   value: '5',    dataset: '2.5 GB',  ops: 1000, price: 27 },
    { label: '12 GB',  value: '12',   dataset: '6 GB',    ops: 2500, price: 55 },
    { label: '25 GB',  value: '25',   dataset: '12.5 GB', ops: 5000, price: 100 },
    { label: '50 GB',  value: '50',   dataset: '25 GB',   ops: 10000, price: 185 },
    { label: '100 GB', value: '100',  dataset: '50 GB',   ops: 20000, price: 350 }
  ];

  var PRO_DATASETS = [
    { label: '1 GB', value: 1 },
    { label: '3 GB', value: 3 },
    { label: '5 GB', value: 5 },
    { label: '10 GB', value: 10 },
    { label: '25 GB', value: 25 },
    { label: '50 GB', value: 50 },
    { label: '100 GB', value: 100 }
  ];

  var PRO_THROUGHPUTS = [
    { label: '1000 Ops/sec', value: 1000 },
    { label: '3000 Ops/sec', value: 3000 },
    { label: '5000 Ops/sec', value: 5000 },
    { label: '10000 Ops/sec', value: 10000 },
    { label: '25000 Ops/sec', value: 25000 },
    { label: '50000 Ops/sec', value: 50000 }
  ];

  var HA_MULTIPLIER = { none: 1, 'single-zone': 1.2, 'multi-zone': 1.5 };
  var PERSIST_ADD = { none: 0, 'aof-1': 0, 'aof-always': 0, 'snapshot-1h': 0, 'snapshot-6h': 0, 'snapshot-12h': 0 };

  var demoMode = true;

  var state = {
    step: 0, name: 'my-redis-db', region: 'us-east-1', cloudVendor: 'aws',
    plan: 'essentials', dbVersion: '8.4', memoryType: 'ram', planSize: '0.25',
    ha: 'none', persistence: 'none', paymentMethodAdded: false,
    revealed: { conn: false, env: false },
    proDatasetIdx: 1, proThroughputIdx: 1,
    proRegionMode: 'single', proFlex: false, proHa: false, proMultiAz: false,
    proRamPct: 20, proHashingPolicy: 'redis',
    proAz: 'no-preference', proEndpoint: 'allow', proMaintenance: 'automatic'
  };

  var el = {};
  function $(id) { return document.getElementById(id); }

  function initEls() {
    el = {
      preStep: $('pre-step'), mainHeader: $('main-header'),
      stepper: $('stepper'), step1: $('step1'), step2: $('step2'),
      step3: $('step3'), stepSuccess: $('step-success'),
      dbName: $('db-name'), dbNameError: $('db-name-error'),
      region: $('region'), cloudVendor: $('cloud-vendor'),
      regionError: $('region-error'), submitError: $('submit-error'),
      formStep1: $('form-step1'),
      reviewName: $('review-name'), reviewRegion: $('review-region'),
      reviewCloud: $('review-cloud'), reviewPlan: $('review-plan'),
      reviewDbVersion: $('review-db-version'),
      reviewMemory: $('review-memory'), reviewMemoryRow: $('review-memory-row'),
      reviewPlanSize: $('review-plan-size'), reviewPlanSizeRow: $('review-plan-size-row'),
      reviewPayment: $('review-payment'), reviewPaymentRow: $('review-payment-row'),
      reviewHa: $('review-ha'), reviewHaRow: $('review-ha-row'),
      reviewPersist: $('review-persist'), reviewPersistRow: $('review-persist-row'),
      reviewThroughput: $('review-throughput'), reviewThroughputRow: $('review-throughput-row'),
      reviewRegionMode: $('review-region-mode'), reviewRegionModeRow: $('review-region-mode-row'),
      reviewRamPct: $('review-ram-pct'), reviewRamPctRow: $('review-ram-pct-row'),
      reviewHashing: $('review-hashing'), reviewHashingRow: $('review-hashing-row'),
      reviewOss: $('review-oss'), reviewOssRow: $('review-oss-row'),
      reviewProtocol: $('review-protocol'), reviewProtocolRow: $('review-protocol-row'),
      reviewPort: $('review-port'), reviewPortRow: $('review-port-row'),
      reviewCopies: $('review-copies'), reviewCopiesRow: $('review-copies-row'),
      reviewEndpoint: $('review-endpoint'), reviewEndpointRow: $('review-endpoint-row'),
      reviewMaintenance: $('review-maintenance'), reviewMaintenanceRow: $('review-maintenance-row'),
      backStep1: $('back-step1'), nextStep1: $('next-step1'),
      backStep2: $('back-step2'), nextStep2: $('next-step2'),
      backStep3: $('back-step3'), createDb: $('create-db'),
      connectionString: $('connection-string'),
      sdkSnippet: $('sdk-snippet'),
      copyConn: $('copy-conn'),
      copySdk: $('copy-sdk'),
      revealConn: $('reveal-conn'),
      changeName: $('change-name'), changeRegion: $('change-region'),
      changeCloud: $('change-cloud'), changePlan: $('change-plan'),
      createAnother: $('create-another'), goToDb: $('go-to-db'),
      configSection: $('config-section'),
      advancedDetails: $('advanced-details'),
      sizeSelector: $('size-selector'), sizeSliderTrack: $('size-slider-track'),
      sizeSliderFill: $('size-slider-fill'), sizePrice: $('size-price'),
      sizeDetailMemory: $('size-detail-memory'),
      sizeDetailReplica: $('size-detail-replica'),
      sizeDetailReplicaRow: $('size-detail-replica-row'),
      sizeDetailOps: $('size-detail-ops'),
      memoryToggle: $('memory-toggle'),
      haSelect: $('ha-select'), persistSelect: $('persistence-select'),
      paymentModal: $('payment-modal'), paymentCancel: $('payment-cancel'),
      paymentForm: $('payment-form')
    };
  }

  function validateName(v) {
    if (!v || v.length < NAME_MIN || v.length > NAME_MAX || !NAME_REGEX.test(v))
      return 'Name must be 3–64 characters: letters, numbers, hyphens, underscores.';
    return null;
  }

  function showNameError(msg) {
    el.dbNameError.hidden = !msg;
    el.dbNameError.textContent = msg || '';
    el.dbName.classList.toggle('input-error', !!msg);
    el.dbName.setAttribute('aria-invalid', !!msg);
  }

  function showRegionError(msg) {
    el.regionError.hidden = !msg;
    el.regionError.textContent = msg || '';
  }

  function showSubmitError(msg) {
    el.submitError.hidden = !msg;
    el.submitError.textContent = msg || '';
  }

  function updateStepper(step) {
    el.stepper.querySelectorAll('.stepper-item').forEach(function (item, i) {
      var s = i + 1;
      item.setAttribute('data-state', s < step ? 'completed' : s === step ? 'active' : 'upcoming');
    });
  }

  function setStep(step) {
    state.step = step;
    showNameError(null); showRegionError(null); showSubmitError(null);
    var inFlow = step >= 1 && step <= 3;
    el.preStep.hidden = step !== 0;
    el.step1.hidden = step !== 1;
    el.step2.hidden = step !== 2;
    el.step3.hidden = step !== 3;
    el.stepSuccess.hidden = step !== 4;
    el.stepper.hidden = !inFlow;
    el.mainHeader.hidden = step === 0 || step === 4;
    if (step === 0) { el.mainHeader.querySelector('.header-title').textContent = 'Create Redis database'; }
    if (step === 1) { el.backStep1.disabled = false; el.dbName.focus(); }
    if (step === 2) { toggleConfig(); updatePrice(); updateStep2Button(); }
    if (step === 3) { syncReview(); }
    if (step === 4) { renderSuccessContent(); }
    if (inFlow) updateStepper(step);
  }

  function halveSize(label) {
    var match = label.match(/^([\d.]+)\s*(MB|GB)$/);
    if (!match) return label;
    var num = parseFloat(match[1]);
    var unit = match[2];
    var half = num / 2;
    if (unit === 'GB' && half < 1) {
      return Math.round(half * 1024) + ' MB';
    }
    var str = half % 1 === 0 ? half.toString() : half.toFixed(1);
    return str + ' ' + unit;
  }

  function getCurrentSizes() {
    return state.memoryType === 'flex' ? FLEX_SIZES : RAM_SIZES;
  }

  function renderSizeOptions() {
    var sizes = getCurrentSizes();
    var track = el.sizeSliderTrack;
    var existingStops = track.querySelectorAll('.size-stop');
    existingStops.forEach(function (s) { s.remove(); });

    var existingTip = el.sizeSelector.querySelector('.free-tooltip');
    if (existingTip) existingTip.remove();

    var freeStop = document.createElement('label');
    freeStop.className = 'size-stop size-stop-free';
    var freeInp = document.createElement('input');
    freeInp.type = 'radio'; freeInp.name = 'plan-size'; freeInp.value = '0.03'; freeInp.disabled = true;
    var freeDot = document.createElement('span');
    freeDot.className = 'size-stop-dot';
    var freeLabel = document.createElement('span');
    freeLabel.className = 'size-stop-label';
    freeLabel.textContent = '30 MB';
    freeStop.appendChild(freeInp); freeStop.appendChild(freeDot); freeStop.appendChild(freeLabel);
    track.appendChild(freeStop);

    var existingDz = track.querySelector('.size-slider-deadzone');
    if (existingDz) existingDz.remove();
    var dz = document.createElement('span');
    dz.className = 'size-slider-deadzone';
    track.appendChild(dz);

    sizes.forEach(function (s, i) {
      var lbl = document.createElement('label');
      lbl.className = 'size-stop';
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = 'plan-size'; inp.value = s.value;
      if (i === 0) inp.checked = true;
      inp.addEventListener('change', function () {
        state.planSize = this.value;
        updateSizeDetails();
        updatePrice();
      });
      var dot = document.createElement('span');
      dot.className = 'size-stop-dot';
      var label = document.createElement('span');
      label.className = 'size-stop-label';
      label.textContent = s.label;
      lbl.appendChild(inp);
      lbl.appendChild(dot);
      lbl.appendChild(label);
      track.appendChild(lbl);
    });
    state.planSize = sizes[0].value;
    updateSizeDetails();
  }

  function updateSizeDetails() {
    var entry = getSizeEntry();
    var sizes = getCurrentSizes();
    var idx = 0;
    for (var i = 0; i < sizes.length; i++) {
      if (sizes[i].value === state.planSize) { idx = i; break; }
    }
    var domIdx = idx + 1;

    if (el.sizeSliderFill) {
      var stops = el.sizeSliderTrack.querySelectorAll('.size-stop');
      var firstRealStop = stops[1];
      if (stops.length > 1 && stops[domIdx] && firstRealStop) {
        var trackRect = el.sizeSliderTrack.getBoundingClientRect();
        var firstRect = firstRealStop.getBoundingClientRect();
        var firstCenter = firstRect.left + firstRect.width / 2;
        var stopRect = stops[domIdx].getBoundingClientRect();
        var stopCenter = stopRect.left + stopRect.width / 2;
        var fillLeftPx = firstCenter - trackRect.left;
        el.sizeSliderFill.style.left = fillLeftPx + 'px';
        var fillWidth = Math.max(0, stopCenter - firstCenter);
        el.sizeSliderFill.style.width = fillWidth + 'px';
        var deadzone = el.sizeSliderTrack.querySelector('.size-slider-deadzone');
        if (deadzone) {
          deadzone.style.width = Math.max(0, firstCenter - trackRect.left - 10) + 'px';
        }
      } else {
        el.sizeSliderFill.style.width = '0px';
      }
    }
    var haMult = HA_MULTIPLIER[state.ha] || 1;
    var total = Math.round(entry.price * haMult);
    setBottomPrice('Total: $' + total + '/mo');
    var haActive = state.ha !== 'none';
    if (haActive) {
      var halfLabel = halveSize(entry.label);
      if (el.sizeDetailMemory) el.sizeDetailMemory.textContent = halfLabel;
      if (el.sizeDetailReplicaRow) el.sizeDetailReplicaRow.hidden = false;
      if (el.sizeDetailReplica) el.sizeDetailReplica.textContent = halfLabel;
    } else {
      if (el.sizeDetailMemory) el.sizeDetailMemory.textContent = entry.label;
      if (el.sizeDetailReplicaRow) el.sizeDetailReplicaRow.hidden = true;
    }
    if (el.sizeDetailOps) el.sizeDetailOps.textContent = entry.ops.toLocaleString() + ' ops/sec';

    var stops = el.sizeSliderTrack.querySelectorAll('.size-stop');
    stops.forEach(function (stop, i) {
      if (i === 0) return;
      stop.classList.toggle('size-stop-filled', (i - 1) <= idx);
    });
  }

  function updateHaOptions() {
    if (!el.haSelect) return;
    var multiOpt = el.haSelect.querySelector('option[value="multi-zone"]');
    if (!multiOpt) return;
    if (state.memoryType === 'flex') {
      multiOpt.disabled = true;
      multiOpt.textContent = 'Multi-zone – RAM only';
      if (state.ha === 'multi-zone') {
        el.haSelect.value = 'none';
        state.ha = 'none';
      }
    } else {
      multiOpt.disabled = false;
      multiOpt.textContent = 'Multi-zone – up to 99.99% uptime';
    }
  }

  function renderFreeSizeSelector() {
    var track = el.sizeSliderTrack;
    var existingStops = track.querySelectorAll('.size-stop');
    existingStops.forEach(function (s) { s.remove(); });

    var allStops = [{ label: '30 MB', value: '0.03' }];
    RAM_SIZES.forEach(function (s) { allStops.push(s); });

    allStops.forEach(function (s, i) {
      var lbl = document.createElement('label');
      lbl.className = 'size-stop' + (i === 0 ? ' size-stop-filled' : '');
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = 'plan-size'; inp.value = s.value;
      inp.disabled = true;
      if (i === 0) inp.checked = true;
      var dot = document.createElement('span');
      dot.className = 'size-stop-dot';
      var label = document.createElement('span');
      label.className = 'size-stop-label';
      label.textContent = s.label;
      lbl.appendChild(inp); lbl.appendChild(dot); lbl.appendChild(label);
      track.appendChild(lbl);
    });

    var existingDz = track.querySelector('.size-slider-deadzone');
    if (existingDz) existingDz.remove();
    if (el.sizeSliderFill) { el.sizeSliderFill.style.width = '0px'; el.sizeSliderFill.style.left = '10px'; }
    setBottomPrice('Total: $0/mo');
    if (el.sizeDetailMemory) el.sizeDetailMemory.textContent = '30 MB';
    if (el.sizeDetailOps) el.sizeDetailOps.textContent = '—';
    if (el.sizeDetailReplicaRow) el.sizeDetailReplicaRow.hidden = true;

    var existing = el.sizeSelector.querySelector('.free-tooltip');
    if (!existing) {
      var tip = document.createElement('div');
      tip.className = 'free-tooltip';
      tip.textContent = 'Unlock more with Essentials';
      el.sizeSelector.appendChild(tip);
      var track = $('size-slider-track');
      if (track) {
        var tOff = track.offsetTop;
        var tH = track.offsetHeight;
        tip.style.top = (tOff + tH / 2) + 'px';
        tip.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  function toggleConfig() {
    var plan = getSelectedPlan();
    var showEssentials = plan === 'essentials';
    var showPro = plan === 'pro';
    var showFree = plan === 'free';

    if (el.sizeSelector) {
      el.sizeSelector.hidden = !(showEssentials || showFree);
      el.sizeSelector.classList.toggle('size-selector-disabled', showFree);
    }
    if (el.memoryToggle) {
      el.memoryToggle.querySelectorAll('.seg-btn').forEach(function (b) {
        b.disabled = showFree;
      });
      el.memoryToggle.classList.toggle('seg-toggle-disabled', showFree);
    }

    var proSel = $('pro-size-selector');
    if (proSel) proSel.hidden = !showPro;
    var proCfg = $('pro-config');
    if (proCfg) proCfg.hidden = !showPro;

    var essAdvWrap = $('essentials-advanced-wrap');
    if (essAdvWrap) essAdvWrap.hidden = showPro;

    if (el.advancedDetails) {
      el.advancedDetails.classList.toggle('advanced-details-disabled', showFree);
      if (showFree) {
        el.advancedDetails.open = false;
      }
    }

    if (showFree) {
      renderFreeSizeSelector();
    } else if (showEssentials) {
      renderSizeOptions();
      updateHaOptions();
    }
    if (showPro) {
      var proRegion = $('pro-region');
      if (proRegion && state.region) proRegion.value = state.region;
      if (state.proRegionMode !== 'active-active') {
        refreshVpcBlocks([state.region || 'us-east-1']);
      }
      updateProSizeDisplay();
    }
    updatePrice();
  }

  function getSelectedPlan() {
    var r = document.querySelector('input[name="plan"]:checked');
    return r ? r.value : 'free';
  }

  function getSizeEntry() {
    var sizes = getCurrentSizes();
    for (var i = 0; i < sizes.length; i++) {
      if (sizes[i].value === state.planSize) return sizes[i];
    }
    return sizes[0];
  }

  function getProPrice() {
    var ds = PRO_DATASETS[state.proDatasetIdx];
    var base = 200 + (ds.value - 1) * 50;
    var haMult = state.proHa ? 2 : 1;
    return Math.round(base * haMult);
  }

  function setBottomPrice(text) {
    var priceEl = document.getElementById('size-price');
    if (priceEl) priceEl.textContent = text;
  }

  function updatePrice() {
    var plan = getSelectedPlan();
    if (plan === 'essentials') {
      updateSizeDetails();
    } else if (plan === 'free') {
      setBottomPrice('Total: $0/mo');
    } else if (plan === 'pro') {
      setBottomPrice('Total: $200/month min');
    }
  }

  function syncReview() {
    var name = el.dbName.value.trim() || state.name;
    var regionVal = el.region ? el.region.value : state.region;
    var cloudVal = el.cloudVendor ? el.cloudVendor.value : state.cloudVendor;
    var plan = getSelectedPlan();
    var dbV = $('db-version');

    var regionLabels = { 'us-east-1': 'US East (N. Virginia)', 'eu-west-1': 'EU (Ireland)', 'ap-southeast-1': 'Asia Pacific (Singapore)' };
    var cloudLabels = { aws: 'AWS', gcp: 'Google Cloud', azure: 'Microsoft Azure' };
    var planLabels = { free: 'Free', essentials: 'Essentials (with Flex)', pro: 'Pro' };
    var memoryLabels = { ram: 'RAM', flex: 'Flex (RAM & SSD)' };
    var haLabels = { none: 'None', 'single-zone': 'Single zone', 'multi-zone': 'Multi-zone' };
    var persistLabels = { none: 'None', 'aof-1': 'AOF every 1 sec', 'aof-always': 'AOF always', 'snapshot-1h': 'Snapshot 1h', 'snapshot-6h': 'Snapshot 6h', 'snapshot-12h': 'Snapshot 12h' };

    el.reviewName.textContent = name || '—';
    el.reviewCloud.textContent = cloudLabels[cloudVal] || cloudVal;
    el.reviewRegion.textContent = regionLabels[regionVal] || regionVal;
    el.reviewPlan.textContent = planLabels[plan] || plan;
    el.reviewDbVersion.textContent = dbV ? dbV.value : '8.4';

    el.reviewMemoryRow.hidden = false;
    el.reviewPlanSizeRow.hidden = false;
    el.reviewThroughputRow.hidden = false;

    if (plan === 'free') {
      el.reviewMemory.textContent = 'RAM';
      el.reviewPlanSize.textContent = '30 MB';
      if (el.reviewThroughput) el.reviewThroughput.textContent = '—';
      el.reviewHaRow.hidden = true;
      el.reviewPersistRow.hidden = true;
    } else if (plan === 'essentials') {
      el.reviewMemory.textContent = memoryLabels[state.memoryType] || 'RAM';
      var entry = getSizeEntry();
      if (state.ha !== 'none') {
        var half = halveSize(entry.label);
        el.reviewPlanSize.textContent = half + ' Dataset | ' + half + ' Replica';
      } else {
        el.reviewPlanSize.textContent = entry.label;
      }
      if (el.reviewThroughput) el.reviewThroughput.textContent = entry.ops ? (entry.ops.toLocaleString() + ' Ops/sec') : '—';
      el.reviewHaRow.hidden = state.ha === 'none';
      el.reviewHa.textContent = haLabels[state.ha] || 'None';
      el.reviewPersistRow.hidden = state.persistence === 'none';
      el.reviewPersist.textContent = persistLabels[state.persistence] || 'None';
    } else {
      var proDs = PRO_DATASETS[state.proDatasetIdx];
      el.reviewMemory.textContent = state.proFlex ? 'Flex (RAM + SSD)' : 'RAM';
      el.reviewPlanSize.textContent = proDs.label + ' dataset / ' + getProTotalMem(proDs) + ' total';
      var proTpReview = PRO_THROUGHPUTS[state.proThroughputIdx];
      if (el.reviewThroughput) el.reviewThroughput.textContent = proTpReview ? proTpReview.label : '—';
      el.reviewHaRow.hidden = false;
      var proHaText = state.proHa ? (state.proMultiAz ? 'Multi-AZ' : 'Single-AZ') : 'None';
      el.reviewHa.textContent = proHaText;
      el.reviewPersistRow.hidden = false;
      var proPersist = $('pro-persistence');
      el.reviewPersist.textContent = proPersist ? (persistLabels[proPersist.value] || 'None') : 'None';
    }

    // Pro-specific rows (except Throughput, which is always shown): only show when changed from defaults
    var proOnlyRows = ['RegionMode', 'RamPct', 'Hashing', 'Oss', 'Protocol', 'Port', 'Copies', 'Endpoint', 'Maintenance'];
    proOnlyRows.forEach(function (key) {
      var row = el['review' + key + 'Row'];
      if (row) row.hidden = true;
    });

    if (plan === 'pro') {
      if (state.proRegionMode !== 'single') {
        var regionNames = [];
        selectedRegions.forEach(function (rid) {
          var m = regionMeta[rid];
          regionNames.push(m ? m.name : rid);
        });
        if (el.reviewRegionMode) el.reviewRegionMode.textContent = 'Active-Active (' + regionNames.join(', ') + ')';
        if (el.reviewRegionModeRow) el.reviewRegionModeRow.hidden = false;
      }

      if (state.proFlex && state.proRamPct !== 20) {
        if (el.reviewRamPct) el.reviewRamPct.textContent = state.proRamPct + '%';
        if (el.reviewRamPctRow) el.reviewRamPctRow.hidden = false;
      }

      if (state.proHashingPolicy && state.proHashingPolicy !== 'redis') {
        var hashLabels = { redis: 'Standard (Redis)', crc16: 'CRC16' };
        if (el.reviewHashing) el.reviewHashing.textContent = hashLabels[state.proHashingPolicy] || state.proHashingPolicy;
        if (el.reviewHashingRow) el.reviewHashingRow.hidden = false;
      }

      var ossToggle = $('pro-oss-toggle');
      if (ossToggle && ossToggle.checked) {
        if (el.reviewOss) el.reviewOss.textContent = 'On';
        if (el.reviewOssRow) el.reviewOssRow.hidden = false;
      }

      var protocolSel = $('pro-protocol');
      if (protocolSel && protocolSel.value !== 'resp2') {
        if (el.reviewProtocol) el.reviewProtocol.textContent = protocolSel.value.toUpperCase();
        if (el.reviewProtocolRow) el.reviewProtocolRow.hidden = false;
      }

      var portSel = $('pro-port-mode');
      if (portSel && portSel.value !== 'auto') {
        var portVal = $('pro-port');
        if (el.reviewPort) el.reviewPort.textContent = portVal ? portVal.value || 'Manual' : 'Manual';
        if (el.reviewPortRow) el.reviewPortRow.hidden = false;
      }

      var qtyVal = $('pro-qty-value');
      if (qtyVal && parseInt(qtyVal.textContent, 10) > 1) {
        if (el.reviewCopies) el.reviewCopies.textContent = qtyVal.textContent;
        if (el.reviewCopiesRow) el.reviewCopiesRow.hidden = false;
      }

      if (state.proEndpoint && state.proEndpoint !== 'allow') {
        if (el.reviewEndpoint) el.reviewEndpoint.textContent = 'Blocked';
        if (el.reviewEndpointRow) el.reviewEndpointRow.hidden = false;
      }

      if (state.proMaintenance && state.proMaintenance !== 'automatic') {
        if (el.reviewMaintenance) el.reviewMaintenance.textContent = 'Manual';
        if (el.reviewMaintenanceRow) el.reviewMaintenanceRow.hidden = false;
      }
    }

    el.reviewPaymentRow.hidden = !state.paymentMethodAdded;
    el.reviewPayment.textContent = state.paymentMethodAdded ? '•••• •••• •••• 4242' : '—';

    var pricingAmount = $('review-pricing-amount');
    var pricingNote = $('review-pricing-note');
    if (pricingAmount) {
      if (plan === 'free') {
        pricingAmount.textContent = '$0/month';
        pricingNote.textContent = 'No payment required';
      } else if (plan === 'essentials') {
        var sizes = getCurrentSizes();
        var priceEntry = null;
        for (var pi = 0; pi < sizes.length; pi++) {
          if (String(sizes[pi].value) === String(state.planSize)) { priceEntry = sizes[pi]; break; }
        }
        if (!priceEntry) priceEntry = sizes[0];
        var haM = HA_MULTIPLIER[state.ha] || 1;
        var monthlyPrice = Math.round(priceEntry.price * haM);
        pricingAmount.textContent = '$' + monthlyPrice + '/month';
        pricingNote.textContent = 'Billed monthly based on your plan size';
      } else {
        pricingAmount.textContent = '$200/month min';
        pricingNote.textContent = 'A $200 hold will be placed on your card and released shortly after';
      }
    }

    var btnText = el.createDb.querySelector('.btn-text');
    if (btnText) {
      btnText.textContent = plan !== 'free' ? 'Pay & create database' : 'Create database';
    }
  }

  function captureStep2State() {
    state.plan = getSelectedPlan();
    state.dbVersion = $('db-version') ? $('db-version').value : '8.4';
    var activeBtn = el.memoryToggle ? el.memoryToggle.querySelector('.seg-btn-active') : null;
    state.memoryType = activeBtn ? activeBtn.getAttribute('data-value') : 'ram';
    var sizeR = document.querySelector('input[name="plan-size"]:checked');
    state.planSize = sizeR ? sizeR.value : '0.25';
    state.ha = el.haSelect ? el.haSelect.value : 'none';
    state.persistence = el.persistSelect ? el.persistSelect.value : 'none';
    var proHashingSel = $('pro-hashing-select');
    if (proHashingSel) state.proHashingPolicy = proHashingSel.value;
    var endpointRadio = document.querySelector('input[name="pro-public-endpoint"]:checked');
    if (endpointRadio) state.proEndpoint = endpointRadio.value;
  }

  function updateStep2Button() {
    var plan = getSelectedPlan();
    if (plan !== 'free' && !state.paymentMethodAdded) {
      el.nextStep2.textContent = 'Add payment method';
    } else {
      el.nextStep2.textContent = 'Next';
    }
  }

  function goNext() {
    if (state.step === 1) {
      var name = el.dbName.value.trim();
      if (!demoMode) {
        var err = validateName(name);
        if (err) { showNameError(err); el.dbName.focus(); return; }
        var regionVal = el.region ? el.region.value : 'us-east-1';
        if (regionVal === UNAVAILABLE_REGION) {
          showRegionError('This region is temporarily unavailable. Choose another region or try again later.');
          return;
        }
      }
      state.name = name || 'demo-db';
      state.region = el.region ? el.region.value : 'us-east-1';
      state.cloudVendor = el.cloudVendor ? el.cloudVendor.value : 'aws';
      setStep(2);
    } else if (state.step === 2) {
      captureStep2State();
      if (state.plan !== 'free' && !state.paymentMethodAdded) {
        if (window.showPaymentStep) window.showPaymentStep(1);
        el.paymentModal.hidden = false;
      } else {
        setStep(3);
      }
    }
  }

  function goBack() {
    if (state.step === 1) setStep(0);
    else if (state.step === 2) setStep(1);
    else if (state.step === 3) setStep(2);
  }

  function createDatabase() {
    var name = el.dbName.value.trim() || state.name;
    var region = el.region ? el.region.value : state.region;
    if (!demoMode) {
      var nameErr = validateName(name);
      if (nameErr) { showSubmitError(nameErr); return; }
      if (region === UNAVAILABLE_REGION) {
        showSubmitError('This region is temporarily unavailable.');
        return;
      }
      if (DUPLICATE_NAMES.indexOf(name.toLowerCase()) !== -1) {
        showSubmitError('A database with this name already exists.');
        return;
      }
    }
    showSubmitError(null);
    el.createDb.classList.add('is-loading');
    el.createDb.querySelector('.btn-loading').hidden = false;
    el.createDb.disabled = true;
    var fail = FAIL_CREATE_NAMES.indexOf(name.toLowerCase()) !== -1;
    setTimeout(function () {
      el.createDb.classList.remove('is-loading');
      el.createDb.querySelector('.btn-loading').hidden = true;
      el.createDb.disabled = false;
      if (fail) showSubmitError("We couldn't create your database. Please try again.");
      else setStep(4);
    }, fail ? 1500 : 1800);
  }

  var SDK_STARTERS = {
    node:   { name: 'JavaScript', url: 'https://github.com/redis-developer/redis-starter-js' },
    python: { name: 'Python',     url: 'https://github.com/redis-developer/redis-starter-python' },
    dotnet: { name: 'C#',         url: 'https://github.com/redis-developer/redis-starter-csharp' },
    java:   { name: 'Java',       url: 'https://github.com/redis-developer/redis-starter-java' },
    go:     { name: 'Go',         url: 'https://github.com/redis-developer/redis-starter-go' }
  };

  function setSdkSnippet(lang) {
    var code;
    if (lang === 'cli') {
      code = MOCK.cliCommandMasked;
    } else {
      code = MOCK.sdk[lang] || MOCK.sdk.node;
    }
    if (el.sdkSnippet) el.sdkSnippet.querySelector('code').textContent = code;
    var starterLink = $('sdk-starter-link');
    if (starterLink) {
      var info = SDK_STARTERS[lang];
      if (info) {
        starterLink.href = info.url;
        starterLink.innerHTML = 'Starter project &mdash; ' + info.name + ' &rarr;';
        starterLink.hidden = false;
      } else {
        starterLink.hidden = true;
      }
    }
  }

  function renderSuccessContent() {
    state.revealed = { conn: false, env: false, password: false };
    el.connectionString.textContent = MOCK.connectionStringMasked;
    el.revealConn.textContent = 'Reveal';

    var langSelect = $('sdk-language');
    if (langSelect) {
      langSelect.value = 'node';
      langSelect.onchange = function () { setSdkSnippet(this.value); };
    }
    setSdkSnippet('node');

    var dbNameEl = $('success-db-name');
    var hostEl = $('success-host');
    var portEl = $('success-port');
    var passwordEl = $('success-password');
    var insightHost = $('insight-host');
    var insightPort = $('insight-port');
    if (dbNameEl) dbNameEl.textContent = state.name || 'my-redis-db';
    if (hostEl) hostEl.textContent = MOCK.host;
    if (portEl) portEl.textContent = MOCK.port;
    if (passwordEl) passwordEl.textContent = '••••••••';
    if (insightHost) insightHost.textContent = MOCK.host;
    if (insightPort) insightPort.textContent = MOCK.port;

    var revealPw = $('reveal-password');
    if (revealPw) {
      revealPw.onclick = function () {
        state.revealed.password = !state.revealed.password;
        passwordEl.textContent = state.revealed.password ? MOCK.password : '••••••••';
        revealPw.textContent = state.revealed.password ? 'Hide' : 'Show';
      };
    }
  }

  function copyToClipboard(text, btn) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      btn.classList.add('copied');
      setTimeout(function () { btn.classList.remove('copied'); }, 2000);
    });
  }

  function planCardSync() {
    document.querySelectorAll('.plan-card').forEach(function (card) {
      var inp = card.querySelector('input[name="plan"]');
      card.classList.toggle('plan-selected', inp && inp.checked);
    });
  }


  function initSliderDrag() {
    var track = el.sizeSliderTrack;
    if (!track) return;
    var dragging = false;

    function snapToNearest(clientX) {
      var stops = track.querySelectorAll('.size-stop');
      if (!stops.length) return;
      var best = null;
      var bestDist = Infinity;
      stops.forEach(function (stop) {
        var inp = stop.querySelector('input');
        if (inp && inp.disabled) return;
        var rect = stop.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var dist = Math.abs(clientX - cx);
        if (dist < bestDist) { bestDist = dist; best = stop; }
      });
      if (best) {
        var inp = best.querySelector('input');
        if (inp && !inp.checked) {
          inp.checked = true;
          state.planSize = inp.value;
          updateSizeDetails();
          updatePrice();
        }
      }
    }

    track.addEventListener('mousedown', function (e) {
      dragging = true;
      track.classList.add('is-dragging');
      snapToNearest(e.clientX);
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      snapToNearest(e.clientX);
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
    });

    track.addEventListener('touchstart', function (e) {
      dragging = true;
      track.classList.add('is-dragging');
      snapToNearest(e.touches[0].clientX);
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      snapToNearest(e.touches[0].clientX);
    }, { passive: true });

    document.addEventListener('touchend', function () {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
    });
  }

  function getProTotalMem(ds) {
    var mult = state.proHa ? 2 : 1;
    return (ds.value * mult) + ' GB';
  }

  function updateProSizeDisplay() {
    var ds = PRO_DATASETS[state.proDatasetIdx];
    var tp = PRO_THROUGHPUTS[state.proThroughputIdx];
    var dsVal = $('pro-ds-value');
    var tpVal = $('pro-tp-value');
    var totalMem = $('pro-total-mem');
    if (dsVal) dsVal.textContent = ds.label;
    if (tpVal) tpVal.textContent = tp.label;
    if (totalMem) totalMem.textContent = getProTotalMem(ds);
    updatePrice();

    if (state.proFlex) {
      var ramPct = state.proRamPct;
      var ssdPct = 100 - ramPct;
      var dsGb = ds.value;
      var ramGb = Math.round(dsGb * ramPct / 100 * 10) / 10;
      var ssdGb = Math.round(dsGb * ssdPct / 100 * 10) / 10;
      var barFill = $('ram-ssd-bar-fill');
      if (barFill) barFill.style.width = ramPct + '%';
      var ramPctLabel = $('ram-pct-label');
      if (ramPctLabel) ramPctLabel.textContent = ramPct + '%';
      var ssdPctLabel = $('ssd-pct-label');
      if (ssdPctLabel) ssdPctLabel.textContent = ssdPct + '%';
      var ramSizeLabel = $('ram-size-label');
      if (ramSizeLabel) ramSizeLabel.textContent = ramGb + 'GB';
      var ssdSizeLabel = $('ssd-size-label');
      if (ssdSizeLabel) ssdSizeLabel.textContent = ssdGb + 'GB';
    }
  }

  var regionMeta = {
    'us-east-1':        { name: 'US East (N. Virginia)',     flag: '🇺🇸', prefix: 'use1' },
    'eu-west-1':        { name: 'EU (Ireland)',              flag: '🇮🇪', prefix: 'euw1' },
    'ap-southeast-1':   { name: 'Asia Pacific (Singapore)',  flag: '🇸🇬', prefix: 'apse1' },
    'us-west-2':        { name: 'US West (Oregon)',          flag: '🇺🇸', prefix: 'usw2' },
    'eu-central-1':     { name: 'EU (Frankfurt)',            flag: '🇩🇪', prefix: 'euc1' }
  };
  var selectedRegions = [];
  var vpcAzMode = 'no-preference';

  function renderTags() {
    var tagContainer = $('region-tags');
    var tagDropdown = $('region-dropdown');
    if (!tagContainer) return;
    tagContainer.innerHTML = '';
    if (selectedRegions.length === 0) {
      tagContainer.innerHTML = '<span class="tag-picker-placeholder">Select regions…</span>';
    } else {
      selectedRegions.forEach(function (rid) {
        var meta = regionMeta[rid] || { name: rid, flag: '' };
        var chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML = meta.flag + ' ' + meta.name +
          ' <button type="button" class="tag-chip-remove" data-region="' + rid + '">&times;</button>';
        tagContainer.appendChild(chip);
      });
    }
    if (tagDropdown) {
      tagDropdown.querySelectorAll('.tag-picker-option').forEach(function (opt) {
        opt.classList.toggle('selected', selectedRegions.indexOf(opt.getAttribute('data-value')) !== -1);
      });
    }
  }

  function buildVpcRow(regionId) {
    var meta = regionMeta[regionId] || { name: regionId, flag: '', prefix: regionId.replace(/-/g, '') };
    var row = document.createElement('div');
    row.className = 'vpc-region-row';
    row.setAttribute('data-vpc-region', regionId);
    var zones = '';
    for (var i = 1; i <= 6; i++) {
      zones += '<option value="' + meta.prefix + '-az' + i + '">' + meta.prefix + '-az' + i + '</option>';
    }
    var showZones = vpcAzMode === 'manual';
    row.innerHTML =
      '<div class="vpc-cell vpc-cell-region">' +
        '<span class="vpc-region-name">' + meta.name + '</span>' +
        '<span class="vpc-region-code">' + regionId + '</span>' +
      '</div>' +
      '<div class="vpc-cell vpc-cell-cidr">' +
        '<div class="cidr-input-wrap">' +
          '<input type="text" name="pro-cidr-' + regionId + '" value="192.168.0.0" placeholder="192.168.0.0" />' +
          '<span class="cidr-suffix">/24 <span class="cidr-check">✓</span></span>' +
        '</div>' +
      '</div>' +
      '<div class="vpc-cell vpc-cell-zones" ' + (showZones ? '' : 'hidden') + '>' +
        '<div class="zone-picker" data-zone-picker="' + regionId + '">' +
          '<div class="zone-picker-display">' +
            '<span class="zone-picker-placeholder">Select three availability zones</span>' +
            '<span class="zone-picker-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="zone-picker-dropdown">' + zones + '</div>' +
        '</div>' +
      '</div>';

    var picker = row.querySelector('[data-zone-picker="' + regionId + '"]');
    var display = picker.querySelector('.zone-picker-display');
    var dropdown = picker.querySelector('.zone-picker-dropdown');

    display.addEventListener('click', function () {
      picker.classList.toggle('open');
    });

    dropdown.querySelectorAll('option').forEach(function (opt) {
      var item = document.createElement('div');
      item.className = 'zone-picker-item';
      item.setAttribute('data-value', opt.value);
      item.innerHTML = '<input type="checkbox" /> <span>' + opt.textContent + '</span>';
      opt.replaceWith(item);

      item.addEventListener('click', function (e) {
        var cb = item.querySelector('input[type="checkbox"]');
        if (e.target !== cb) cb.checked = !cb.checked;
        item.classList.toggle('checked', cb.checked);
        var selected = [];
        dropdown.querySelectorAll('.zone-picker-item.checked').forEach(function (el) {
          selected.push(el.getAttribute('data-value'));
        });
        var placeholder = display.querySelector('.zone-picker-placeholder');
        if (selected.length > 0) {
          placeholder.textContent = selected.join(', ');
          placeholder.classList.add('has-value');
        } else {
          placeholder.textContent = 'Select three availability zones';
          placeholder.classList.remove('has-value');
        }
      });
    });

    return row;
  }

  function refreshVpcBlocks(regions) {
    var container = $('vpc-config-container');
    if (!container) return;
    container.innerHTML = '';

    var showZones = vpcAzMode === 'manual';

    var header = document.createElement('div');
    header.className = 'vpc-table-header';
    header.innerHTML =
      '<div class="vpc-header-cell">Region</div>' +
      '<div class="vpc-header-cell">Deployment CIDR <span class="info-tooltip" data-tip="Subnet for Redis Enterprise deployment. Must not overlap with your application VPC or any peered networks.">&#9432;</span></div>' +
      (showZones ? '<div class="vpc-header-cell">Zone IDs</div>' : '');
    container.appendChild(header);

    regions.forEach(function (rid) {
      container.appendChild(buildVpcRow(rid));
    });
  }

  function syncVpcFromTags() {
    var regions = selectedRegions.length ? selectedRegions : [state.region || 'us-east-1'];
    refreshVpcBlocks(regions);
  }

  function initProControls() {
    var dsM = $('pro-ds-minus'), dsP = $('pro-ds-plus');
    var tpM = $('pro-tp-minus'), tpP = $('pro-tp-plus');

    if (dsM) dsM.addEventListener('click', function () {
      if (state.proDatasetIdx > 0) { state.proDatasetIdx--; updateProSizeDisplay(); }
    });
    if (dsP) dsP.addEventListener('click', function () {
      if (state.proDatasetIdx < PRO_DATASETS.length - 1) { state.proDatasetIdx++; updateProSizeDisplay(); }
    });
    if (tpM) tpM.addEventListener('click', function () {
      if (state.proThroughputIdx > 0) { state.proThroughputIdx--; updateProSizeDisplay(); }
    });
    if (tpP) tpP.addEventListener('click', function () {
      if (state.proThroughputIdx < PRO_THROUGHPUTS.length - 1) { state.proThroughputIdx++; updateProSizeDisplay(); }
    });

    var haToggle = $('pro-ha-toggle');
    var haLabel = $('pro-ha-label');
    if (haToggle) {
      haToggle.addEventListener('change', function () {
        state.proHa = this.checked;
        if (haLabel) haLabel.textContent = this.checked ? 'On' : 'Off';
        updateProSizeDisplay();
      });
    }

    var multiAzToggle = $('pro-multiaz-toggle');
    var multiAzLabel = $('pro-multiaz-label');
    if (multiAzToggle) {
      multiAzToggle.addEventListener('change', function () {
        state.proMultiAz = this.checked;
        if (multiAzLabel) multiAzLabel.textContent = this.checked ? 'On' : 'Off';
      });
    }

    /* ---- Tag Picker for multi-region ---- */
    var tagPicker = $('region-tag-picker');
    var tagContainer = $('region-tags');
    var tagDropdown = $('region-dropdown');

    if (tagPicker) {
      tagContainer.addEventListener('click', function (e) {
        var rmBtn = e.target.closest('.tag-chip-remove');
        if (rmBtn) {
          var rid = rmBtn.getAttribute('data-region');
          selectedRegions = selectedRegions.filter(function (r) { return r !== rid; });
          renderTags();
          syncVpcFromTags();
          e.stopPropagation();
          return;
        }
        tagPicker.classList.toggle('open');
      });
      if (tagDropdown) {
        tagDropdown.addEventListener('click', function (e) {
          var opt = e.target.closest('.tag-picker-option');
          if (!opt) return;
          var val = opt.getAttribute('data-value');
          var idx = selectedRegions.indexOf(val);
          if (idx === -1) {
            selectedRegions.push(val);
          } else {
            selectedRegions.splice(idx, 1);
          }
          renderTags();
          syncVpcFromTags();
        });
      }
      document.addEventListener('click', function (e) {
        if (tagPicker && !tagPicker.contains(e.target)) {
          tagPicker.classList.remove('open');
        }
        document.querySelectorAll('.zone-picker.open').forEach(function (zp) {
          if (!zp.contains(e.target)) zp.classList.remove('open');
        });
      });
    }

    document.querySelectorAll('input[name="vpc-az-mode"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        vpcAzMode = this.value;
        var currentRegions;
        if (state.proRegionMode === 'active-active') {
          currentRegions = selectedRegions.length ? selectedRegions : [state.region || 'us-east-1'];
        } else {
          var pr = $('pro-region');
          currentRegions = [pr ? pr.value : (state.region || 'us-east-1')];
        }
        refreshVpcBlocks(currentRegions);
      });
    });

    /* ---- Region mode toggle ---- */
    var regionToggle = $('pro-region-toggle');
    var proRegion = $('pro-region');
    var singleWrap = $('pro-region-single-wrap');
    var multiWrap = $('pro-region-multi-wrap');
    if (regionToggle) {
      regionToggle.querySelectorAll('.seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          regionToggle.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('seg-btn-active'); });
          this.classList.add('seg-btn-active');
          state.proRegionMode = this.getAttribute('data-value');
          var isActive = state.proRegionMode === 'active-active';
          if (singleWrap) singleWrap.hidden = isActive;
          if (multiWrap) multiWrap.hidden = !isActive;
          var multiAzRow = $('pro-multiaz-toggle') ? $('pro-multiaz-toggle').closest('.pro-toggle-row') : null;
          var memTypeRow = $('pro-memtype-row');

          if (isActive) {
            state.proFlex = false;
            var fSeg = $('pro-flex-toggle-seg');
            if (fSeg) {
              fSeg.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('seg-btn-active'); });
              var ramBtn = fSeg.querySelector('[data-value="ram"]');
              if (ramBtn) ramBtn.classList.add('seg-btn-active');
            }
            var rpw = $('pro-ram-pct-wrap'), rbw = $('pro-ram-bar-wrap');
            if (rpw) rpw.hidden = true;
            if (rbw) rbw.hidden = true;

            state.proMultiAz = true;
            var maz = $('pro-multiaz-toggle');
            var mazL = $('pro-multiaz-label');
            if (maz) maz.checked = true;
            if (mazL) mazL.textContent = 'On';

            if (multiAzRow) { multiAzRow.classList.add('locked-by-aa'); multiAzRow.setAttribute('data-tip', 'Required by Active-Active'); }
            if (memTypeRow) { memTypeRow.classList.add('locked-by-aa'); memTypeRow.setAttribute('data-tip', 'Not supported by Active-Active'); }

            updateProSizeDisplay();

            var primary = state.region || 'us-east-1';
            if (selectedRegions.indexOf(primary) === -1) {
              selectedRegions = [primary];
            }
            renderTags();
            syncVpcFromTags();
          } else {
            if (multiAzRow) { multiAzRow.classList.remove('locked-by-aa'); multiAzRow.removeAttribute('data-tip'); }
            if (memTypeRow) { memTypeRow.classList.remove('locked-by-aa'); memTypeRow.removeAttribute('data-tip'); }
            refreshVpcBlocks([proRegion ? proRegion.value : 'us-east-1']);
          }
        });
      });
    }

    if (proRegion) {
      proRegion.addEventListener('change', function () {
        if (state.proRegionMode !== 'active-active') {
          refreshVpcBlocks([this.value]);
        }
      });
    }

    refreshVpcBlocks([state.region || 'us-east-1']);

    var flexToggleSeg = $('pro-flex-toggle-seg');
    var ramPctWrap = $('pro-ram-pct-wrap');
    var ramBarWrap = $('pro-ram-bar-wrap');
    if (flexToggleSeg) {
      flexToggleSeg.querySelectorAll('.seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          flexToggleSeg.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('seg-btn-active'); });
          this.classList.add('seg-btn-active');
          state.proFlex = this.getAttribute('data-value') === 'flex';
          if (ramPctWrap) ramPctWrap.hidden = !state.proFlex;
          if (ramBarWrap) ramBarWrap.hidden = !state.proFlex;
          updateProSizeDisplay();
        });
      });
    }

    var ratioPicker = $('ratio-picker');
    if (ratioPicker) {
      ratioPicker.querySelectorAll('.ratio-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          ratioPicker.querySelectorAll('.ratio-option').forEach(function (b) { b.classList.remove('ratio-option-active'); });
          this.classList.add('ratio-option-active');
          state.proRamPct = parseInt(this.getAttribute('data-value'), 10);
          updateProSizeDisplay();
        });
      });
    }

    var maintenanceToggle = $('pro-maintenance-toggle');
    var maintManualCfg = $('maint-manual-config');
    var maintAutoHint = $('maint-auto-hint');
    if (maintenanceToggle) {
      maintenanceToggle.querySelectorAll('.seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          maintenanceToggle.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('seg-btn-active'); });
          this.classList.add('seg-btn-active');
          state.proMaintenance = this.getAttribute('data-value');
          var isManual = state.proMaintenance === 'manual';
          if (maintManualCfg) maintManualCfg.hidden = !isManual;
          if (maintAutoHint) maintAutoHint.hidden = isManual;
        });
      });
    }

    var portModeSelect = $('pro-port-mode');
    var portInputWrap = $('pro-port-input-wrap');
    if (portModeSelect) {
      portModeSelect.addEventListener('change', function () {
        if (portInputWrap) portInputWrap.hidden = this.value !== 'manual';
      });
    }

    var ossToggle = $('pro-oss-toggle');
    var ossLabel = $('pro-oss-label');
    if (ossToggle) {
      ossToggle.addEventListener('change', function () {
        if (ossLabel) ossLabel.textContent = this.checked ? 'On' : 'Off';
      });
    }

    var qtyM = $('pro-qty-minus'), qtyP = $('pro-qty-plus'), qtyVal = $('pro-qty-value');
    var proQty = 1;
    if (qtyM) qtyM.addEventListener('click', function () {
      if (proQty > 1) { proQty--; if (qtyVal) qtyVal.textContent = proQty; }
    });
    if (qtyP) qtyP.addEventListener('click', function () {
      if (proQty < 10) { proQty++; if (qtyVal) qtyVal.textContent = proQty; }
    });
  }

  function init() {
    initEls();


    var qsModal = $('quickstart-modal');
    $('btn-quickstart').addEventListener('click', function () {
      if (qsModal) qsModal.hidden = false;
    });
    $('quickstart-modal-close').addEventListener('click', function () {
      if (qsModal) qsModal.hidden = true;
    });
    if (qsModal) {
      qsModal.addEventListener('click', function (e) {
        if (e.target === qsModal) qsModal.hidden = true;
      });
    }
    $('qs-confirm').addEventListener('click', function () {
      var qsCloud = $('qs-cloud');
      var qsRegion = $('qs-region');
      state.name = 'my-free-db';
      state.region = qsRegion ? qsRegion.value : 'us-east-1';
      state.cloudVendor = qsCloud ? qsCloud.value : 'aws';
      state.plan = 'free';
      state.dbVersion = '8.4';
      state.memoryType = 'ram';
      state.ha = 'none';
      state.persistence = 'none';
      el.dbName.value = state.name;
      if (el.region) el.region.value = state.region;
      if (el.cloudVendor) el.cloudVendor.value = state.cloudVendor;
      document.querySelector('input[name="plan"][value="free"]').checked = true;
      planCardSync();
      if (qsModal) qsModal.hidden = true;
      el.preStep.hidden = true;
      setStep(4);
    });

    $('btn-custom-create').addEventListener('click', function () {
      setStep(1);
    });

    el.backStep1.addEventListener('click', goBack);
    el.formStep1.addEventListener('submit', function (e) { e.preventDefault(); goNext(); });
    el.dbName.addEventListener('input', function () { if (!demoMode) showNameError(validateName(this.value.trim())); });
    el.dbName.addEventListener('blur', function () { if (!demoMode) showNameError(validateName(this.value.trim())); });

    el.nextStep2.addEventListener('click', goNext);
    el.backStep2.addEventListener('click', goBack);
    el.backStep3.addEventListener('click', goBack);
    el.createDb.addEventListener('click', createDatabase);

    function forcePriceForPlan(planVal) {
      var priceEl = document.getElementById('size-price');
      if (!priceEl) return;
      if (planVal === 'free') {
        priceEl.textContent = 'Total: $0/mo';
      } else if (planVal === 'pro') {
        priceEl.textContent = 'Total: $200/month min';
      } else if (planVal === 'essentials') {
        var sizeEntry = getSizeEntry();
        var haM = HA_MULTIPLIER[state.ha] || 1;
        priceEl.textContent = 'Total: $' + Math.round(sizeEntry.price * haM) + '/mo';
      }
    }
    document.querySelectorAll('.plan-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var inp = card.querySelector('input[name="plan"]');
        if (!inp) return;
        inp.checked = true;
        var planVal = inp.value;
        forcePriceForPlan(planVal);
        planCardSync();
        toggleConfig();
        updatePrice();
        updateStep2Button();
        forcePriceForPlan(planVal);
      });
    });
    document.querySelectorAll('input[name="plan"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var planVal = this.value;
        forcePriceForPlan(planVal);
        planCardSync();
        toggleConfig();
        updatePrice();
        updateStep2Button();
        forcePriceForPlan(planVal);
      });
    });
    planCardSync();
    updateStep2Button();

    if (el.memoryToggle) {
      el.memoryToggle.querySelectorAll('.seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          el.memoryToggle.querySelectorAll('.seg-btn').forEach(function (b) {
            b.classList.remove('seg-btn-active');
          });
          this.classList.add('seg-btn-active');
          state.memoryType = this.getAttribute('data-value');
          renderSizeOptions();
          updateHaOptions();
          updatePrice();
        });
      });
    }

    initSliderDrag();
    initProControls();

    if (el.haSelect) el.haSelect.addEventListener('change', function () { state.ha = this.value; updateSizeDetails(); updatePrice(); });
    if (el.persistSelect) el.persistSelect.addEventListener('change', function () { state.persistence = this.value; updatePrice(); });

    el.changeName.addEventListener('click', function (e) { e.preventDefault(); setStep(1); });
    el.changeRegion.addEventListener('click', function (e) { e.preventDefault(); setStep(1); });
    if (el.changeCloud) el.changeCloud.addEventListener('click', function (e) { e.preventDefault(); setStep(1); });
    el.changePlan.addEventListener('click', function (e) { e.preventDefault(); setStep(2); });

    if (el.paymentCancel) {
      el.paymentCancel.addEventListener('click', function () { el.paymentModal.hidden = true; });
    }

    var payStep1 = $('pay-step-1');
    var payStep2 = $('pay-step-2');
    var billingForm = $('billing-form');
    var billingBack = $('billing-back');
    var modalDot1 = $('modal-dot-1');
    var modalDot2 = $('modal-dot-2');

    function showPaymentStep(n) {
      if (payStep1) payStep1.hidden = n !== 1;
      if (payStep2) payStep2.hidden = n !== 2;
      if (modalDot1) {
        modalDot1.className = n === 1 ? 'modal-step-dot modal-step-active' : 'modal-step-dot modal-step-completed';
      }
      if (modalDot2) {
        modalDot2.className = n === 2 ? 'modal-step-dot modal-step-active' : 'modal-step-dot';
      }
    }
    window.showPaymentStep = showPaymentStep;

    if (el.paymentForm) {
      el.paymentForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!demoMode) {
          var num = $('card-number').value.trim();
          var exp = $('card-exp').value.trim();
          var cvc = $('card-cvc').value.trim();
          var cardName = $('card-name').value.trim();
          if (!num || !exp || !cvc || !cardName) return;
        }
        showPaymentStep(2);
      });
    }

    if (billingBack) {
      billingBack.addEventListener('click', function () { showPaymentStep(1); });
    }

    if (billingForm) {
      billingForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!demoMode) {
          var bName = $('billing-name').value.trim();
          var bAddr = $('billing-address').value.trim();
          var bCity = $('billing-city').value.trim();
          var bZip = $('billing-zip').value.trim();
          if (!bName || !bAddr || !bCity || !bZip) return;
        }
        state.paymentMethodAdded = true;
        el.paymentModal.hidden = true;
        el.nextStep2.textContent = 'Next';
        setStep(3);
      });
    }

    var couponToggle = $('coupon-toggle');
    var couponField = $('coupon-field');
    var couponApply = $('coupon-apply');
    var couponStatus = $('coupon-status');
    if (couponToggle && couponField) {
      couponToggle.addEventListener('click', function () {
        couponField.hidden = !couponField.hidden;
      });
    }
    if (couponApply && couponStatus) {
      couponApply.addEventListener('click', function () {
        var code = $('coupon-code').value.trim();
        couponStatus.hidden = false;
        if (!code) {
          couponStatus.textContent = 'Please enter a coupon code.';
          couponStatus.className = 'coupon-status coupon-error';
        } else {
          couponStatus.textContent = 'Coupon "' + code + '" applied successfully!';
          couponStatus.className = 'coupon-status coupon-success';
          state.couponCode = code;
        }
      });
    }

    $('demo-close').addEventListener('click', function () {
      demoMode = false;
      $('demo-banner').hidden = true;
    });

    el.copyConn.addEventListener('click', function () { copyToClipboard(MOCK.connectionString, el.copyConn); });
    el.copySdk.addEventListener('click', function () {
      var lang = $('sdk-language') ? $('sdk-language').value : 'node';
      var text = lang === 'cli' ? MOCK.cliCommand : (MOCK.sdk[lang] || MOCK.sdk.node);
      copyToClipboard(text, el.copySdk);
    });

    el.revealConn.addEventListener('click', function () {
      state.revealed.conn = !state.revealed.conn;
      el.connectionString.textContent = state.revealed.conn ? MOCK.connectionString : MOCK.connectionStringMasked;
      el.revealConn.textContent = state.revealed.conn ? 'Hide' : 'Reveal';
    });

    document.querySelectorAll('.success-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.success-tab').forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        var target = this.getAttribute('data-tab');
        document.querySelectorAll('.success-tab-panel').forEach(function (p) {
          p.hidden = p.id !== 'tab-' + target;
        });
      });
    });

    el.createAnother.addEventListener('click', function () {
      el.dbName.value = 'my-redis-db';
      state.name = 'my-redis-db'; state.region = 'us-east-1'; state.cloudVendor = 'aws';
      state.plan = 'essentials'; state.paymentMethodAdded = false; state.couponCode = '';
      state.ha = 'none'; state.persistence = 'none'; state.memoryType = 'ram';
      state.proDatasetIdx = 1; state.proThroughputIdx = 1;
      state.proRegionMode = 'single'; state.proFlex = false; state.proHa = false; state.proMultiAz = false;
      state.proRamPct = 20; state.proHashingPolicy = 'redis';
      state.proAz = 'no-preference'; state.proEndpoint = 'allow'; state.proMaintenance = 'automatic';
      if (el.region) el.region.value = 'us-east-1';
      if (el.cloudVendor) el.cloudVendor.value = 'aws';
      document.querySelector('input[name="plan"][value="essentials"]').checked = true;
      var dbV = $('db-version'); if (dbV) dbV.value = '8.4';
      if (el.memoryToggle) {
        el.memoryToggle.querySelectorAll('.seg-btn').forEach(function (b, i) {
          b.classList.toggle('seg-btn-active', i === 0);
        });
      }
      if (el.haSelect) el.haSelect.value = 'none';
      if (el.persistSelect) el.persistSelect.value = 'none';
      if (el.advancedDetails) el.advancedDetails.open = false;
      var proFlexSeg = $('pro-flex-toggle-seg');
      if (proFlexSeg) {
        proFlexSeg.querySelectorAll('.seg-btn').forEach(function (b, i) {
          b.classList.toggle('seg-btn-active', i === 0);
        });
      }
      var proHaT = $('pro-ha-toggle');
      if (proHaT) proHaT.checked = false;
      var proHaLbl = $('pro-ha-label');
      if (proHaLbl) proHaLbl.textContent = 'Off';
      var proMultiAz = $('pro-multiaz-toggle');
      if (proMultiAz) proMultiAz.checked = false;
      var proMultiAzLbl = $('pro-multiaz-label');
      if (proMultiAzLbl) proMultiAzLbl.textContent = 'Off';
      var multiAzRow = proMultiAz ? proMultiAz.closest('.pro-toggle-row') : null;
      if (multiAzRow) { multiAzRow.classList.remove('locked-by-aa'); multiAzRow.removeAttribute('data-tip'); }
      var memTypeRow = $('pro-memtype-row');
      if (memTypeRow) { memTypeRow.classList.remove('locked-by-aa'); memTypeRow.removeAttribute('data-tip'); }
      var ramPctWrap = $('pro-ram-pct-wrap');
      if (ramPctWrap) ramPctWrap.hidden = true;
      var ramBarWrap = $('pro-ram-bar-wrap');
      if (ramBarWrap) ramBarWrap.hidden = true;
      var ratioPicker = $('ratio-picker');
      if (ratioPicker) {
        ratioPicker.querySelectorAll('.ratio-option').forEach(function (b) {
          b.classList.toggle('ratio-option-active', b.getAttribute('data-value') === '20');
        });
      }
      var singleWrap = $('pro-region-single-wrap');
      var multiWrap = $('pro-region-multi-wrap');
      if (singleWrap) singleWrap.hidden = false;
      if (multiWrap) multiWrap.hidden = true;
      var proRegion = $('pro-region');
      if (proRegion) proRegion.value = 'us-east-1';
      selectedRegions = ['us-east-1'];
      renderTags();
      refreshVpcBlocks(['us-east-1']);
      var couponCode = $('coupon-code');
      var couponField = $('coupon-field');
      var couponStatus = $('coupon-status');
      if (couponCode) couponCode.value = '';
      if (couponField) couponField.hidden = true;
      if (couponStatus) couponStatus.hidden = true;
      planCardSync(); toggleConfig();
      setStep(0);
    });

    document.addEventListener('input', function (e) {
      if (e.target.tagName === 'INPUT' && /rm\s*-\s*rf\s*\//.test(e.target.value)) {
        window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      }
    });

    toggleConfig();
    setStep(0);
  }

  init();
})();
