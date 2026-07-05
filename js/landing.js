  var renderModes = [
    { mode: "Photorealistic",   img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=90", desc: "True-to-life photorealistic output from any SketchUp model" },
    { mode: "HyperReal Mode",   img: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200&q=90", desc: "8K HyperReal mode — maximum detail and material fidelity" },
    { mode: "Sketch Style",     img: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&q=90", desc: "Architectural sketch style — hand-drawn presentation look" },
    { mode: "Night Scene",      img: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1200&q=90", desc: "Night scene render — dramatic lighting and ambience" },
    { mode: "Golden Hour",      img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=90", desc: "Golden hour — warm sunset tones for exterior showcases" },
    { mode: "Interior",         img: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&q=90", desc: "Interior rendering with accurate light bounce and materials" },
    { mode: "Aerial / Site Plan", img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1200&q=90", desc: "Aerial & site plan view — perfect for master planning" },
    { mode: "Floorplan",        img: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=90", desc: "Floorplan render — clean 2D/3D presentation drawings" },
    { mode: "Watercolor",       img: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=90", desc: "Watercolor artistic style — painterly soft-edge output" },
    { mode: "Line Art",         img: "https://images.unsplash.com/photo-1486591038955-01454438df63?w=1200&q=90", desc: "Line art — clean architectural line drawing style" },
    { mode: "Stormy",           img: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=1200&q=90", desc: "Stormy atmosphere — dramatic moody exterior renders" },
    { mode: "Overcast",         img: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1200&q=90", desc: "Overcast diffuse lighting — soft even exterior illumination" }
  ];
  var currentRenderIdx = 0;

  function openRenderPreview(el) {
    var img   = el.getAttribute('data-img');
    var desc  = el.getAttribute('data-desc');
    var mode  = el.innerText.trim();
    currentRenderIdx = renderModes.findIndex(function(m){ return m.mode === mode; });
    if (currentRenderIdx < 0) currentRenderIdx = 0;
    setRenderPreview(currentRenderIdx);
    var modal = document.getElementById('render-preview-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function setRenderPreview(idx) {
    var m = renderModes[idx];
    document.getElementById('rp-img').src = m.img;
    document.getElementById('rp-img').style.animation = 'none';
    document.getElementById('rp-mode-label').textContent = m.mode;
    document.getElementById('rp-desc').textContent = m.desc;
    setTimeout(function(){ document.getElementById('rp-img').style.animation = ''; }, 10);
  }

  function navigateRender(dir) {
    currentRenderIdx = (currentRenderIdx + dir + renderModes.length) % renderModes.length;
    setRenderPreview(currentRenderIdx);
  }

  function closeRenderPreview(e) {
    if (e && e.target !== document.getElementById('render-preview-modal')) return;
    document.getElementById('render-preview-modal').style.display = 'none';
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', function(e) {
    var modal = document.getElementById('render-preview-modal');
    if (modal.style.display === 'none') return;
    if (e.key === 'Escape')      { modal.style.display = 'none'; document.body.style.overflow = ''; }
    if (e.key === 'ArrowRight')  navigateRender(1);
    if (e.key === 'ArrowLeft')   navigateRender(-1);
  });
    (function() {
    var track = document.getElementById('galleryTrack');
    var isDragging = false, startX, scrollLeft;

    track.addEventListener('mousedown', function(e) {
      isDragging = true;
      track.classList.add('dragging');
      startX = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      e.preventDefault();
      var x = e.pageX - track.offsetLeft;
      var walk = (x - startX) * 1.5;
      track.scrollLeft = scrollLeft - walk;
    });

    document.addEventListener('mouseup', function() {
      isDragging = false;
      track.classList.remove('dragging');
    });

    // Per-card reveal + 3D tilt on mouse move
    var cards = track.querySelectorAll('.render-card');
    cards.forEach(function(card) {
      var rendered = card.querySelector('.layer-rendered');
      var divider  = card.querySelector('.reveal-divider');

      card.addEventListener('mousemove', function(e) {
        if (isDragging) return;
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var pct = Math.min(Math.max((x / rect.width) * 100, 0), 100);

        // Reveal layer
        rendered.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
        divider.style.left = pct + '%';

        // 3D tilt
        var cx = rect.left + rect.width / 2;
        var cy = rect.top  + rect.height / 2;
        var dx = (e.clientX - cx) / (rect.width  / 2);
        var dy = (e.clientY - cy) / (rect.height / 2);
        card.style.transform = 'perspective(1000px) rotateY(' + (dx * 8) + 'deg) rotateX(' + (-dy * 5) + 'deg) scale(1.04)';
      });

      card.addEventListener('mouseleave', function() {
        rendered.style.clipPath = 'inset(0 100% 0 0)';
        divider.style.left = '0';
        card.style.transform = '';
      });

      // Click to open lightbox (show rendered image)
      card.addEventListener('click', function() {
        if (isDragging) return;
        var img = card.querySelector('.layer-rendered img');
        var label = card.getAttribute('data-label') || '';
        var num   = card.getAttribute('data-num')   || '';
        openImgLightbox(img.src, label, num);
      });
    });
  })();
  function openImgLightbox(src, label, num) {
    var lb = document.getElementById('img-lightbox');
    document.getElementById('lb-img').src = src;
    document.getElementById('lb-img').style.animation = 'none';
    document.getElementById('lb-label').textContent = label;
    document.getElementById('lb-num').textContent = num ? '0' + num : '';
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(function(){ document.getElementById('lb-img').style.animation = ''; }, 10);
  }
  function closeImgLightbox(e) {
    if (e && e.target !== document.getElementById('img-lightbox') && e.target !== document.querySelector('#img-lightbox button')) return;
    document.getElementById('img-lightbox').style.display = 'none';
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.getElementById('img-lightbox').style.display = 'none';
      document.body.style.overflow = '';
    }
  });
  var sg_selected_tier = '';
  var sg_plans = {
    starter: { title: 'Starter Pack', sub: '11 Credits — $5', price: '$5' },
    pro:     { title: 'Pro Pack',     sub: '41 Credits — $11', price: '$11' },
    studio:  { title: 'Studio Pack',  sub: '151 Credits — $41', price: '$41' }
  };

  function openPaymentModal(tier) {
    sg_selected_tier = tier;
    var plan = sg_plans[tier];
    document.getElementById('sg-modal-plan-title').textContent = plan.title;
    document.getElementById('sg-modal-plan-sub').textContent = plan.sub;
    document.getElementById('sg-checkout-btn').textContent = 'Proceed to Secure Payment — ' + plan.price;
    var modal = document.getElementById('sg-payment-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(function(){ document.getElementById('sg-web-email').focus(); }, 80);
  }

  function closePaymentModal() {
    document.getElementById('sg-payment-modal').style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('sg-checkout-btn').textContent = 'Proceed to Secure Payment';
  }

  // Close on backdrop click
  document.getElementById('sg-payment-modal').addEventListener('click', function(e) {
    if (e.target === this) closePaymentModal();
  });

  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closePaymentModal();
  });

  async function triggerWebCheckout() {
    var emailInput = document.getElementById('sg-web-email').value.trim();
    if (!emailInput) {
      document.getElementById('sg-web-email').style.borderColor = '#D01C1C';
      document.getElementById('sg-web-email').focus();
      return;
    }

    var SERVER_URL = "https://sketchupgurus-ai-server.onrender.com/api/create-payment-link";
    var btn = document.getElementById('sg-checkout-btn');
    var originalText = btn.textContent;
    btn.textContent = "Connecting to Secure Checkout...";
    btn.disabled = true;
    btn.style.opacity = '0.7';

    try {
      var response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, tier: sg_selected_tier })
      });
      var data = await response.json();

      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        alert("Error creating checkout: " + (data.error || "Unknown Error"));
        btn.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    } catch (error) {
      alert("Could not connect to the payment gateway. Please try again.");
      btn.textContent = originalText;
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
(function() {
  var stack = document.getElementById('holoStack');
  if (!stack) return;

  var cards = Array.from(stack.querySelectorAll('.holo-card'));
  var N = cards.length;
  var isHovering = false;
  var raf = null;
  var targetMx = 0, targetMy = 0;
  var currentMx = 0, currentMy = 0;

  // Resting positions: stacked deck with slight offset
  function setResting() {
    cards.forEach(function(card, i) {
      var depth  = i * 4;
      var shiftX = i * 3;
      var shiftY = i * 2;
      var rot    = i * 0.8;
      card.style.transition = 'transform 0.7s cubic-bezier(0.23,1,0.32,1), opacity 0.5s ease, box-shadow 0.5s ease';
      card.style.transform  = 'translateZ(-' + depth + 'px) translateX(' + shiftX + 'px) translateY(' + shiftY + 'px) rotateY(' + rot + 'deg)';
      card.style.opacity    = Math.max(0.08, 1 - i * 0.09).toFixed(2);
      card.style.zIndex     = N - i;
      card.style.boxShadow  = '0 20px 60px rgba(0,0,0,0.6)';
    });
  }

  // Spread positions driven by cursor
  function spread(mx, my) {
    // mx,my are -1..1 relative to stack center
    cards.forEach(function(card, i) {
      var t = i / (N - 1); // 0..1

      // Each card gets a unique orbit angle spread around the cursor vector
      var angle   = (t - 0.5) * Math.PI * 1.6; // fan -144deg..+144deg
      var radius  = 180 + i * 18;               // distance from center

      // Direction follows cursor: cards fan perpendicular to cursor direction
      var baseDirX = mx;
      var baseDirY = my;
      var len = Math.sqrt(baseDirX*baseDirX + baseDirY*baseDirY) || 0.001;
      var ndx = baseDirX / len;
      var ndy = baseDirY / len;

      // Perpendicular
      var px = -ndy;
      var py =  ndx;

      var spreadX = (ndx * Math.cos(angle) - py * Math.sin(angle)) * radius * (0.4 + Math.abs(mx) * 0.6);
      var spreadY = (ndy * Math.cos(angle) + px * Math.sin(angle)) * radius * (0.4 + Math.abs(my) * 0.6);

      // Add depth variation
      var tz = 60 - i * 14;

      // 3D tilt based on cursor position
      var rotX = -my * 18 * (1 - t * 0.5);
      var rotY =  mx * 18 * (1 - t * 0.5);
      var rotZ =  (angle / Math.PI) * 8;

      card.style.transition = 'none';
      card.style.transform  = [
        'translate3d(' + spreadX.toFixed(1) + 'px, ' + spreadY.toFixed(1) + 'px, ' + tz + 'px)',
        'rotateX(' + rotX.toFixed(1) + 'deg)',
        'rotateY(' + rotY.toFixed(1) + 'deg)',
        'rotateZ(' + rotZ.toFixed(1) + 'deg)'
      ].join(' ');
      card.style.opacity   = (0.75 + (1 - t) * 0.25).toFixed(2);
      card.style.zIndex    = N - i;
      card.style.boxShadow = i === 0
        ? '0 30px 80px rgba(208,28,28,0.4), 0 0 0 1px rgba(208,28,28,0.35)'
        : '0 16px 40px rgba(0,0,0,0.55)';
    });
  }

  function animate() {
    if (!isHovering) return;
    // Smooth interpolation
    currentMx += (targetMx - currentMx) * 0.1;
    currentMy += (targetMy - currentMy) * 0.1;
    spread(currentMx, currentMy);
    raf = requestAnimationFrame(animate);
  }

  stack.addEventListener('mouseenter', function() {
    isHovering = true;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(animate);
  });

  stack.addEventListener('mousemove', function(e) {
    var rect = stack.getBoundingClientRect();
    targetMx = ((e.clientX - rect.left)  / rect.width  - 0.5) * 2;
    targetMy = ((e.clientY - rect.top)   / rect.height - 0.5) * 2;
  });

  stack.addEventListener('mouseleave', function() {
    isHovering = false;
    cancelAnimationFrame(raf);
    // Smooth return to rest
    var steps = 0;
    function returnToRest() {
      steps++;
      currentMx *= 0.85;
      currentMy *= 0.85;
      if (Math.abs(currentMx) > 0.01 || Math.abs(currentMy) > 0.01) {
        spread(currentMx, currentMy);
        requestAnimationFrame(returnToRest);
      } else {
        setResting();
      }
    }
    requestAnimationFrame(returnToRest);
  });

  setResting();
})();
  (function() {
    var appFrameLoaded = false;

    window.openAppModal = function(e) {
      if (e) e.preventDefault();
      var modal = document.getElementById('app-modal');
      var frame = document.getElementById('sgai-app-frame');
      if (!appFrameLoaded && frame) {
        frame.src = 'app.html';
        appFrameLoaded = true;
      }
      modal.classList.remove('is-closing');
      modal.classList.add('is-open');
      modal.classList.add('is-opening');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      // Auto-close mobile nav menu if open when starting the app
      var navLinks = document.querySelector('.nav-links');
      if (navLinks.classList.contains('is-active')) {
        toggleMobileMenu();
      }
    };

    window.closeAppModal = function() {
      var modal = document.getElementById('app-modal');
      if (!modal.classList.contains('is-open')) return;
      modal.classList.remove('is-opening');
      modal.classList.add('is-closing');
      setTimeout(function() {
        modal.classList.remove('is-open');
        modal.classList.remove('is-closing');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }, 220);
    };

    document.getElementById('app-modal').addEventListener('click', function(e) {
      if (e.target === this) closeAppModal();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && document.getElementById('app-modal').classList.contains('is-open')) {
        closeAppModal();
      }
    });

    // Mobile navigation menu toggle
    window.toggleMobileMenu = function(e) {
      if (e) e.preventDefault();
      var navLinks = document.querySelector('.nav-links');
      var toggleBtn = document.querySelector('.nav-mobile-toggle');
      var openIcon = toggleBtn.querySelector('.menu-icon-open');
      var closeIcon = toggleBtn.querySelector('.menu-icon-close');
      
      var isActive = navLinks.classList.toggle('is-active');
      if (isActive) {
        openIcon.style.display = 'none';
        closeIcon.style.display = 'block';
        document.body.style.overflow = 'hidden';
      } else {
        openIcon.style.display = 'block';
        closeIcon.style.display = 'none';
        document.body.style.overflow = '';
      }
    };

    // Close mobile nav menu when a link inside is clicked
    document.querySelectorAll('.nav-links a').forEach(function(link) {
      link.addEventListener('click', function() {
        var navLinks = document.querySelector('.nav-links');
        if (navLinks.classList.contains('is-active')) {
          toggleMobileMenu();
        }
      });
    });
  })();