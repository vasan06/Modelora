/* =========================
   THEME CONTROL
========================= */
const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");

const savedTheme = localStorage.getItem("modelora_theme") || "light";
root.setAttribute("data-theme", savedTheme);

themeToggle.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("modelora_theme", next);
});


/* =========================
   MOBILE MENU
========================= */
const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");

menuBtn.addEventListener("click", () => {
  navLinks.classList.toggle("open");
  menuBtn.classList.toggle("open");
});

document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    menuBtn.classList.remove("open");
  });
});


/* =========================
   DIFFERENT 3D REVEAL TYPES
========================= */
const revealClasses = [
  "reveal-rise",
  "reveal-slide-left",
  "reveal-slide-right",
  "reveal-flip",
  "reveal-zoom",
  "reveal-float"
];

const depthCards = document.querySelectorAll(".depth-card");

depthCards.forEach((card, index) => {
  card.classList.add(revealClasses[index % revealClasses.length]);
});


/* =========================
   SCROLL OBSERVER
========================= */
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("show");
    } else {
      entry.target.classList.remove("show");
    }
  });
}, { threshold: 0.18 });

depthCards.forEach(card => observer.observe(card));


/* =========================
   GLOBAL 3D MOUSE PARALLAX
========================= */
window.addEventListener("mousemove", e => {
  const x = (e.clientX / window.innerWidth - 0.5) * 18;
  const y = (e.clientY / window.innerHeight - 0.5) * 18;

  depthCards.forEach(card => {
    card.style.setProperty("--rx", `${-y}deg`);
    card.style.setProperty("--ry", `${x}deg`);
  });
});


/* =========================
   SCROLL DEPTH FLOW EFFECT
========================= */
let lastDepthScroll = window.scrollY;
let loopScrollLock = false;

function maxLandingScroll(){
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function applyDepthFlow(){
  const y = window.scrollY;
  const max = maxLandingScroll() || 1;
  const progress = y / max;
  const direction = y >= lastDepthScroll ? 1 : -1;
  root.style.setProperty("--scroll-progress", progress.toFixed(4));

  document.querySelectorAll(".depth-section").forEach((section, i) => {
    const wave = Math.sin((progress * Math.PI * 2) + i * 0.75);
    const offset = wave * 14;
    const z = wave * 18;
    const tilt = direction * wave * 1.8;
    section.style.transform = `translate3d(0, ${offset}px, ${z}px) rotateX(${tilt}deg)`;
  });
  lastDepthScroll = y;
}

function jumpLandingLoop(to){
  loopScrollLock = true;
  window.scrollTo({top:to, behavior:"auto"});
  requestAnimationFrame(() => {
    lastDepthScroll = window.scrollY;
    loopScrollLock = false;
    applyDepthFlow();
  });
}

window.addEventListener("scroll", () => {
  if(loopScrollLock) return;
  applyDepthFlow();
});

window.addEventListener("wheel", e => {
  if(loopScrollLock) return;
  const max = maxLandingScroll();
  if(max < 300) return;
  if(e.deltaY < 0 && window.scrollY <= 1){
    e.preventDefault();
    jumpLandingLoop(max - 2);
  }
}, {passive:false});

window.addEventListener("keydown", e => {
  if(loopScrollLock) return;
  const max = maxLandingScroll();
  if(max < 300) return;
  if((e.key === "ArrowUp" || e.key === "PageUp") && window.scrollY <= 1){
    e.preventDefault();
    jumpLandingLoop(max - 2);
  }
});

let landingTouchY = 0;
window.addEventListener("touchstart", e => {
  landingTouchY = e.touches[0]?.clientY || 0;
}, {passive:true});

window.addEventListener("touchmove", e => {
  if(loopScrollLock) return;
  const max = maxLandingScroll();
  if(max < 300) return;
  const y = e.touches[0]?.clientY || landingTouchY;
  const delta = landingTouchY - y;
  if(delta < -24 && window.scrollY <= 1){
    e.preventDefault();
    jumpLandingLoop(max - 2);
  }
}, {passive:false});

applyDepthFlow();


/* =========================
   ALGORITHM CLICK EXPLAINER
========================= */
const algoTitle = document.getElementById("algoTitle");
const algoText = document.getElementById("algoText");

const algoDetails = {
  linear: {
    title: "Linear Regression",
    text: "Imagine you're trying to predict how much money someone makes based on their years of education. Linear Regression is like drawing the straightest possible line through a bunch of data points on a graph. This line represents the relationship between education and salary. For example, if you have data showing that someone with 10 years of education makes $50,000, 12 years makes $60,000, and 14 years makes $70,000, Linear Regression would find that for every extra year of education, salary increases by about $10,000. The algorithm calculates this by minimizing the distance between the line and all the actual data points. It's called 'linear' because it assumes the relationship is a straight line. In code, you'd use something like: from sklearn.linear_model import LinearRegression; model = LinearRegression(); model.fit(X_train, y_train); predictions = model.predict(X_test). This is perfect for simple predictions where the relationship between variables is roughly straight."
  },
  ridge: {
    title: "Ridge Regression",
    text: "Think of Linear Regression as a student who sometimes cheats by memorizing too much from the training data, leading to poor performance on new tests. Ridge Regression is like that student's wiser cousin who uses a penalty system to prevent cheating. When you have many features (like predicting house prices from size, location, age, number of rooms, etc.), some features might be correlated, causing the model to overfit. Ridge adds a 'penalty' term to the loss function that shrinks the coefficients of less important features towards zero, but never exactly to zero. This is called L2 regularization. Mathematically, it minimizes: Sum of squared errors + λ * sum of squared coefficients. The λ value controls how much penalty to apply - higher λ means more shrinkage. In practice, you'd tune λ using cross-validation. Code example: from sklearn.linear_model import Ridge; model = Ridge(alpha=0.1); model.fit(X_train, y_train). It's great when you suspect multicollinearity in your features."
  },
  lasso: {
    title: "Lasso Regression",
    text: "Lasso is like Ridge's stricter sibling who doesn't just shrink coefficients - it can actually eliminate them completely! Imagine you're trying to predict stock prices using hundreds of economic indicators. Some indicators might be completely irrelevant, but Linear Regression would still try to use them. Lasso (Least Absolute Shrinkage and Selection Operator) uses L1 regularization, which can force coefficients to exactly zero, effectively performing feature selection automatically. This is incredibly useful for datasets with many features where you want to identify the truly important ones. The loss function becomes: Sum of squared errors + λ * sum of absolute values of coefficients. The λ value controls the strength of regularization. In code: from sklearn.linear_model import Lasso; model = Lasso(alpha=0.01); model.fit(X_train, y_train). After training, you can check model.coef_ to see which features survived. Perfect for sparse solutions where most features should be ignored."
  },
  tree_reg: {
    title: "Decision Tree Regression",
    text: "Decision Trees are like playing a game of 20 Questions to make predictions. Imagine you're trying to predict someone's age based on their characteristics. The tree might first ask: 'Are they taller than 6 feet?' If yes, it might guess they're older; if no, it asks 'Do they have gray hair?' and so on. Each question splits the data into smaller groups, and at the leaves, you get the average value of that group. The algorithm chooses splits that minimize the variance within each resulting group. Unlike Linear Regression, Decision Trees can capture non-linear relationships and interactions between features. They're also interpretable - you can actually see the decision rules. However, they can overfit if not pruned. Code: from sklearn.tree import DecisionTreeRegressor; model = DecisionTreeRegressor(max_depth=5); model.fit(X_train, y_train). Great for when relationships aren't straight lines and you need explainable predictions."
  },
  rf_reg: {
    title: "Random Forest Regression",
    text: "Random Forest is like asking a committee of experts instead of one person. Each expert is a Decision Tree, but they're trained on different subsets of the data and use different features. This reduces overfitting that a single tree might have. Imagine predicting house prices: one tree might focus heavily on location, another on square footage, a third on number of bedrooms. By averaging their predictions, you get a more robust estimate. The 'random' part means each tree only sees a random subset of features at each split, ensuring diversity. This ensemble approach typically performs better than individual trees. In code: from sklearn.ensemble import RandomForestRegressor; model = RandomForestRegressor(n_estimators=100, random_state=42); model.fit(X_train, y_train). You can also get feature importance scores with model.feature_importances_. Excellent for complex datasets where you want high accuracy and some interpretability."
  },
  knn_reg: {
    title: "KNN Regression",
    text: "K-Nearest Neighbors Regression is like asking your neighbors for advice. When you want to predict a value for a new data point, KNN finds the K most similar points from your training data and averages their values. For example, if you're predicting the price of a house, KNN would look at the K most similar houses (similar size, location, age) and average their prices. The 'K' is a hyperparameter you choose - too small and it's sensitive to noise, too large and it might include irrelevant neighbors. Distance is usually measured with Euclidean distance, but other metrics work too. It's a 'lazy' learner - no training phase, just stores the data. Code: from sklearn.neighbors import KNeighborsRegressor; model = KNeighborsRegressor(n_neighbors=5); model.fit(X_train, y_train). Great for small datasets or when the decision boundary is irregular. However, it doesn't scale well to large datasets since prediction requires scanning all training data."
  },

  logistic: {
    title: "Logistic Regression",
    text: "Logistic Regression is for when you need yes/no answers, not numbers. Imagine you're trying to predict whether someone will buy a product based on their age and income. Linear Regression might give you values like 1.5 or -0.3, but Logistic Regression squishes those into probabilities between 0 and 1 using the sigmoid function: P(yes) = 1 / (1 + e^(-linear_combination)). The model still finds the best line, but then applies this S-curve to convert to probabilities. During training, it uses maximum likelihood estimation to find the best coefficients. You can set a threshold (usually 0.5) to convert probabilities to class labels. Code: from sklearn.linear_model import LogisticRegression; model = LogisticRegression(); model.fit(X_train, y_train); probabilities = model.predict_proba(X_test). It's interpretable, works well with linearly separable data, and gives you both predictions and confidence scores. Perfect for binary classification problems like spam detection or medical diagnosis."
  },
  tree_cls: {
    title: "Decision Tree Classification",
    text: "Decision Tree Classification is like a flowchart for making decisions. Starting from the root, each internal node asks a question about a feature, and based on the answer, you follow different branches until you reach a leaf that gives the final class. For example, classifying animals: 'Does it have fur?' -> Yes: 'Does it bark?' -> Yes: Dog, No: Cat. The algorithm chooses questions that best separate the classes, measured by metrics like Gini impurity or information gain. Each split creates purer groups. Unlike Logistic Regression, it can handle non-linear relationships and feature interactions automatically. Trees can be visualized and are highly interpretable. However, they can overfit, so pruning or setting max_depth helps. Code: from sklearn.tree import DecisionTreeClassifier; model = DecisionTreeClassifier(max_depth=5); model.fit(X_train, y_train). Excellent for when you need explainable models and your data has complex patterns."
  },
  rf_cls: {
    title: "Random Forest Classification",
    text: "Random Forest Classification is an ensemble of Decision Trees, each voting on the final class. Like Random Forest Regression, it creates diversity by training each tree on a bootstrap sample of the data and using random feature subsets. This reduces overfitting compared to single trees. For classification, the final prediction is the majority vote of all trees. Imagine diagnosing diseases: one doctor might focus on symptoms, another on test results, a third on patient history. By combining their opinions, you get more reliable diagnosis. You can also get probability estimates by counting votes. Feature importance helps identify which variables matter most. Code: from sklearn.ensemble import RandomForestClassifier; model = RandomForestClassifier(n_estimators=100, random_state=42); model.fit(X_train, y_train); predictions = model.predict(X_test). It's robust, handles missing values well, and works with both categorical and numerical features. Great for most classification tasks where accuracy is more important than interpretability."
  },
  knn_cls: {
    title: "KNN Classification",
    text: "K-Nearest Neighbors Classification works by finding the K most similar training examples to a new instance and letting them vote on the class. For example, classifying flowers: if 3 out of 5 nearest neighbors are roses, classify as rose. The 'K' parameter is crucial - odd numbers prevent ties, and you tune it via cross-validation. Distance metrics matter: Euclidean for continuous features, Hamming for categorical. It's non-parametric, meaning no assumptions about data distribution. Like KNN Regression, it's a lazy learner with no training phase. Code: from sklearn.neighbors import KNeighborsClassifier; model = KNeighborsClassifier(n_neighbors=5); model.fit(X_train, y_train). It works well for small datasets with clear clusters. However, it's sensitive to irrelevant features and doesn't scale to large datasets. Good for baseline models or when you have domain knowledge about good distance metrics."
  },
  bayes: {
    title: "Naive Bayes",
    text: "Naive Bayes is based on Bayes' Theorem: P(Class|Features) = P(Features|Class) * P(Class) / P(Features). The 'naive' part assumes all features are independent given the class, which is rarely true but often works well anyway. For text classification, it counts word frequencies in each class. For example, classifying emails as spam: if 'viagra' appears often in spam emails, seeing it increases spam probability. There are variants: Gaussian NB for continuous features, Multinomial NB for word counts, Bernoulli NB for binary features. It's fast to train, works with small data, and handles high-dimensional data well. Code: from sklearn.naive_bayes import GaussianNB; model = GaussianNB(); model.fit(X_train, y_train). Despite the independence assumption, it performs surprisingly well on many real-world problems, especially text classification. Great when you need a simple, fast baseline or have many features."
  },

  kmeans: {
    title: "K-Means Clustering",
    text: "K-Means is like sorting objects into groups where similar items are together. You tell it how many groups (K) you want, and it finds the best way to divide the data. Imagine you have customer data and want 3 customer segments. K-Means would find 3 cluster centers and assign each customer to the nearest center. It works by: 1) Randomly place K centroids, 2) Assign each point to nearest centroid, 3) Move centroids to center of their points, 4) Repeat until convergence. The algorithm minimizes within-cluster sum of squared distances. Choosing K is tricky - use elbow method or silhouette score. Code: from sklearn.cluster import KMeans; model = KMeans(n_clusters=3, random_state=42); labels = model.fit_predict(X). It assumes spherical clusters of similar size, and is sensitive to initialization. Good for when you know the number of clusters and want fast, simple clustering."
  },
  hierarchical: {
    title: "Hierarchical Clustering",
    text: "Hierarchical Clustering builds a tree of clusters, either bottom-up (agglomerative) or top-down (divisive). The agglomerative approach starts with each point as its own cluster, then repeatedly merges the closest pairs until one big cluster remains. Distance between clusters can be measured as single-linkage (minimum distance), complete-linkage (maximum), or average-linkage. The result is a dendrogram showing the hierarchy. You can cut the tree at different heights to get different numbers of clusters. Unlike K-Means, you don't need to specify K beforehand. Code: from sklearn.cluster import AgglomerativeClustering; model = AgglomerativeClustering(n_clusters=3); labels = model.fit_predict(X). It's deterministic (no random initialization), preserves hierarchy, but is O(n³) so doesn't scale well. Perfect for small datasets where you want to explore different cluster granularities or understand cluster relationships."
  },

  pca: {
    title: "PCA",
    text: "Principal Component Analysis is like taking a high-dimensional dataset and finding the most important directions (principal components) to project it onto fewer dimensions. Imagine you have data with 100 features - PCA finds combinations of these features that capture the most variance. The first principal component is the direction of maximum variance, the second is orthogonal to the first with maximum remaining variance, and so on. This reduces dimensionality while preserving as much information as possible. Mathematically, it finds eigenvectors of the covariance matrix. You can choose how many components to keep based on explained variance. Code: from sklearn.decomposition import PCA; pca = PCA(n_components=2); X_reduced = pca.fit_transform(X); pca.explained_variance_ratio_ shows how much variance each component explains. It's unsupervised, linear, and great for visualization, noise reduction, or as preprocessing for other algorithms."
  },

  labelprop: {
    title: "Label Propagation",
    text: "Label Propagation is like having some labeled examples and wanting to label the rest by seeing which labeled neighbors they're most similar to. It's semi-supervised learning - you have a few labeled points and many unlabeled ones. The algorithm spreads labels through the data based on similarity. For example, if you have a few labeled images of cats and dogs, and many unlabeled animal images, it would propagate the labels based on visual similarity. It works by building a graph where points are connected by similarity, then iteratively updating labels until convergence. Code: from sklearn.semi_supervised import LabelPropagation; model = LabelPropagation(); model.fit(X, y_with_missing_labels). It can handle very few labeled examples and is good for when labeling is expensive. However, it assumes the labeled examples are representative and the graph structure captures the true similarities."
  },

  qlearning: {
    title: "Q-Learning",
    text: "Q-Learning is how an agent learns to make decisions by trial and error. Imagine teaching a robot to navigate a maze. The robot tries different paths, gets rewards for reaching the goal and penalties for hitting walls. Q-Learning maintains a Q-table that stores the expected reward for each state-action pair. The update rule is: Q(s,a) = Q(s,a) + alpha * (reward + gamma * max(Q(s',a')) - Q(s,a)). Alpha is learning rate, gamma is discount factor for future rewards. Over time, the agent learns the optimal policy. In code, you'd implement it with a dictionary or numpy array for the Q-table, then loop through episodes of exploration. It's model-free reinforcement learning, works for discrete state/action spaces, and can learn optimal behavior without knowing the environment dynamics. Perfect for game AI, robotics, or any sequential decision making."
  }
};

document.querySelectorAll(".algo-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const key = chip.dataset.algo;
    const item = algoDetails[key];

    if (!item) return;

    document.querySelectorAll(".algo-chip")
      .forEach(c => c.classList.remove("active"));

    chip.classList.add("active");

    algoTitle.textContent = item.title;
    algoText.textContent = item.text;

    document.getElementById("algorithmExplainer")
      .scrollIntoView({ behavior: "smooth", block: "center" });
  });
});


/* =========================
   NEURAL BACKGROUND CANVAS
========================= */
const canvas = document.getElementById("sceneCanvas");
const ctx = canvas.getContext("2d");

let w, h, nodes;

function resizeCanvas() {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;

  const count = window.innerWidth < 700 ? 35 : 70;

  nodes = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 2 + 1
  }));
}

function draw() {
  ctx.clearRect(0, 0, w, h);

  const isLight = root.getAttribute("data-theme") === "light";

  const nodeColor = isLight
    ? "rgba(70,80,200,"
    : "rgba(90,230,255,";

  const lineColor = isLight
    ? "rgba(70,80,200,"
    : "rgba(124,92,252,";

  nodes.forEach(n => {
    n.x += n.vx;
    n.y += n.vy;

    if (n.x < 0 || n.x > w) n.vx *= -1;
    if (n.y < 0 || n.y > h) n.vy *= -1;

    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = nodeColor + "0.7)";
    ctx.fill();
  });

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 130) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.strokeStyle = lineColor + `${0.18 * (1 - dist / 130)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(draw);
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
draw();


/* =========================
   MINI ML DEMO
========================= */
const studyHours = document.getElementById("studyHours");
const attendance = document.getElementById("attendance");
const studyHoursValue = document.getElementById("studyHoursValue");
const attendanceValue = document.getElementById("attendanceValue");
const predictedScore = document.getElementById("predictedScore");

function updateMiniPrediction(){
  if(!studyHours || !attendance) return;

  const h = Number(studyHours.value);
  const a = Number(attendance.value);

  studyHoursValue.textContent = `${h} hours`;
  attendanceValue.textContent = `${a}%`;

  let score = Math.round((h * 6.5) + (a * 0.45));
  score = Math.max(35, Math.min(score, 98));

  predictedScore.textContent = `${score}%`;
}

if(studyHours && attendance){
  studyHours.addEventListener("input", updateMiniPrediction);
  attendance.addEventListener("input", updateMiniPrediction);
  updateMiniPrediction();
}


/* =========================
   ALGORITHM VISUAL CHANGER
========================= */
const algoVisualMap = {
  linear: {name:"Linear Regression", family:"regression"},
  ridge: {name:"Ridge Regression", family:"regression"},
  lasso: {name:"Lasso Regression", family:"regression"},
  tree_reg: {name:"Decision Tree Regression", family:"regression"},
  rf_reg: {name:"Random Forest Regression", family:"regression"},
  knn_reg: {name:"KNN Regression", family:"regression"},
  logistic: {name:"Logistic Regression", family:"classification"},
  tree_cls: {name:"Decision Tree", family:"classification"},
  rf_cls: {name:"Random Forest", family:"classification"},
  knn_cls: {name:"KNN", family:"classification"},
  bayes: {name:"Naive Bayes", family:"classification"},
  kmeans: {name:"K-Means", family:"clustering"},
  hierarchical: {name:"Hierarchical", family:"clustering"},
  pca: {name:"PCA", family:"dimension"},
  labelprop: {name:"Label Propagation", family:"semi"},
  qlearning: {name:"Q-Learning", family:"rl"}
};

function hashString(value){
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function algoVisualMarkup(algo){
  const hash = hashString(algo.name);
  const c = {
    blue:"#00d4ff",
    green:"#00e5a0",
    gold:"#ffb700",
    red:"#ff4d6d",
    purple:"#7c5cfc",
    pink:"#e040fb",
    ink:"rgba(255,255,255,.75)",
    soft:"rgba(255,255,255,.12)"
  };
  const baseColor = [c.purple,c.green,c.gold,c.blue][(hash >> 3) % 4];
  const label = algo.name;
  const safeLabel = label.replace(/[&<>"']/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[ch]));

  const line = (x1,y1,x2,y2,color=baseColor,w=2,extra="") =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${color};stroke-width:${w};stroke-linecap:round;${extra}"></line>`;
  const path = (d,color=baseColor,w=3,fill="none",extra="") =>
    `<path d="${d}" style="fill:${fill};stroke:${color};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round;${extra}"></path>`;
  const dot = (x,y,color=baseColor,r=6,extra="") =>
    `<circle cx="${x}" cy="${y}" r="${r}" style="fill:${color};filter:drop-shadow(0 0 8px ${color});${extra}"></circle>`;
  const hollow = (x,y,color=baseColor,r=8,extra="") =>
    `<circle cx="${x}" cy="${y}" r="${r}" style="fill:transparent;stroke:${color};stroke-width:2;filter:none;${extra}"></circle>`;
  const rect = (x,y,w,h,color=baseColor,rx=8,extra="") =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" style="fill:${color};${extra}"></rect>`;
  const text = (x,y,value,size=10,color=c.ink,weight=700) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" style="fill:${color};letter-spacing:0">${value}</text>`;
  const axis = () => `${line(38,148,270,148,c.soft,2)}${line(44,154,44,32,c.soft,2)}`;
  const wrap = svgContent => `
    <svg viewBox="0 0 300 180" role="img" aria-label="${safeLabel} visualization">
      ${rect(0,0,300,180,"rgba(255,255,255,.025)",0)}
      ${text(18,22,safeLabel,12,baseColor,800)}
      ${svgContent}
    </svg>`;
  const miniTree = (x,y,color=c.green,labelText="T") => `
    ${dot(x,y,color,8)}
    ${line(x,y+8,x-18,y+34,color,2)}
    ${line(x,y+8,x+18,y+34,color,2)}
    ${dot(x-18,y+38,c.blue,6)}
    ${dot(x+18,y+38,c.gold,6)}
    ${text(x-6,y+4,labelText,8,"#08111f",900)}
  `;
  const network = (layers, outputColors=[c.gold]) => layers.map((count, layer) => {
    const x = 58 + layer * (180 / Math.max(1, layers.length - 1));
    const gap = 84 / Math.max(1, count - 1);
    return Array.from({length: count}, (_, node) => {
      const y = count === 1 ? 92 : 50 + node * gap;
      const color = layer === layers.length - 1 ? outputColors[node % outputColors.length] : c.blue;
      const prev = layer === 0 ? "" : Array.from({length: layers[layer - 1]}, (_, p) => {
        const px = 58 + (layer - 1) * (180 / Math.max(1, layers.length - 1));
        const pgap = 84 / Math.max(1, layers[layer - 1] - 1);
        const py = layers[layer - 1] === 1 ? 92 : 50 + p * pgap;
        return line(px+8,py,x-8,y,"rgba(124,92,252,.34)",1);
      }).join("");
      return `${prev}${dot(x,y,color,8)}`;
    }).join("");
  }).join("");

  const visuals = {
    "Logistic Regression": () => wrap(`${axis()}${path("M58 136 C96 134 108 98 140 88 C176 76 190 48 244 46",c.pink,4)}${dot(82,118,c.blue)}${dot(112,108,c.blue)}${dot(190,64,c.gold)}${dot(224,54,c.gold)}${text(212,88,"p>0.5",10,c.gold)}`),
    "Decision Tree": () => wrap(`${miniTree(150,48,c.green,"?")}${rect(62,128,56,24,c.blue,7)}${rect(182,128,56,24,c.gold,7)}${text(76,144,"No",10,"#07111e")}${text(198,144,"Yes",10,"#07111e")}`),
    "KNN": () => wrap(`${dot(151,88,c.pink,9)}${hollow(151,88,c.pink,58)}${[dot(104,74,c.blue),dot(115,121,c.blue),dot(176,64,c.gold),dot(204,112,c.gold),line(151,88,104,74,c.blue,1),line(151,88,115,121,c.blue,1),line(151,88,176,64,c.gold,1)].join("")}${text(145,92,"?",11,"#fff",900)}`),
    "Naive Bayes": () => wrap(`${axis()}${rect(75,98,34,50,c.blue,5)}${rect(133,58,34,90,c.green,5)}${rect(191,118,34,30,c.gold,5)}${text(72,162,"spam",9,c.ink)}${text(129,162,"ham",9,c.ink)}${text(188,162,"other",9,c.ink)}${path("M72 56 C108 44 148 42 226 72",c.pink,2)}`),
    "SVM (RBF)": () => wrap(`${path("M62 132 C92 62 154 138 236 48",c.purple,4)}${path("M52 110 C94 42 162 118 246 34",c.soft,2)}${path("M72 152 C94 84 144 158 226 70",c.soft,2)}${dot(89,96,c.blue)}${dot(118,123,c.blue)}${dot(191,72,c.gold)}${dot(218,52,c.gold)}${hollow(118,123,c.pink,12)}${hollow(191,72,c.pink,12)}`),
    "Perceptron": () => wrap(`${axis()}${line(72,128,232,52,c.pink,4)}${line(134,96,172,76,c.gold,3)}${dot(88,112,c.blue)}${dot(118,122,c.blue)}${dot(196,58,c.green)}${dot(224,72,c.green)}${text(166,74,"w",11,c.gold)}`),
    "Ridge Classifier": () => wrap(`${axis()}${line(82,132,224,54,c.green,4)}${path("M90 118 L216 50",c.soft,2)}${path("M92 146 L238 68",c.soft,2)}${rect(55,48,14,76,c.blue,5)}${rect(74,78,14,46,c.blue,5)}${rect(93,98,14,26,c.blue,5)}${text(54,138,"small w",9,c.ink)}`),
    "Linear Regression": () => wrap(`${axis()}${[dot(75,122,c.blue),dot(112,108,c.blue),dot(150,86,c.blue),dot(190,70,c.blue),dot(226,50,c.blue)].join("")}${line(64,128,238,46,c.pink,4)}${text(206,42,"y=ax+b",10,c.pink)}`),
    "Polynomial Regression": () => wrap(`${axis()}${path("M58 132 C94 62 134 64 158 100 C184 142 214 116 246 48",c.pink,4)}${[dot(66,126,c.blue),dot(102,74,c.blue),dot(146,92,c.blue),dot(188,126,c.blue),dot(236,54,c.blue)].join("")}${text(206,150,"x^2,x^3",10,c.ink)}`),
    "Ridge / Lasso": () => wrap(`${axis()}${rect(70,72,18,76,c.blue,4)}${rect(106,92,18,56,c.green,4)}${rect(142,126,18,22,c.gold,4)}${rect(178,142,18,6,c.red,3)}${rect(214,148,18,0,c.red,3)}${path("M60 48 L238 48",c.soft,2)}${text(164,42,"shrink w",10,c.ink)}`),
    "Random Forest": () => wrap(`${miniTree(82,42,c.green,"1")}${miniTree(150,42,c.blue,"2")}${miniTree(218,42,c.gold,"3")}${line(82,94,150,132,c.green,2)}${line(150,94,150,132,c.blue,2)}${line(218,94,150,132,c.gold,2)}${dot(150,142,c.pink,16)}${text(135,146,"vote",10,"#07111e")}`),
    "AdaBoost": () => wrap(`${axis()}${rect(62,112,38,26,c.blue,6)}${text(72,130,"h1",10,"#07111e")}${line(104,125,134,125,c.gold,3)}${rect(136,84,38,54,c.green,6)}${text(146,114,"h2",10,"#07111e")}${line(178,111,208,111,c.gold,3)}${rect(210,56,38,82,c.pink,6)}${text(220,100,"h3",10,"#07111e")}${dot(118,58,c.red,5)}${dot(186,46,c.red,8)}${text(108,42,"mistakes get weight",9,c.ink)}`),
    "Gradient Boosting": () => wrap(`${axis()}${rect(62,104,34,44,c.blue,5)}${rect(112,86,34,62,c.green,5)}${rect(162,68,34,80,c.gold,5)}${rect(212,50,34,98,c.pink,5)}${path("M80 76 L128 68 L178 58 L228 46",c.red,3)}${text(94,42,"adds residual fixes",10,c.ink)}`),
    "XGBoost": () => wrap(`${miniTree(116,45,c.gold,"x")}${miniTree(196,45,c.green,"g")}${path("M72 140 C124 118 170 112 236 96",c.pink,3)}${rect(72,120,48,20,"rgba(255,77,109,.45)",6)}${text(78,134,"prune",9,c.ink)}${text(150,158,"loss + Ω",10,c.ink)}`),
    "K-Means": () => wrap(`${[dot(78,70,c.blue),dot(96,92,c.blue),dot(66,106,c.blue),dot(202,72,c.gold),dot(224,94,c.gold),dot(194,112,c.gold),dot(144,132,c.green),dot(162,146,c.green)].join("")}${hollow(82,90,c.blue,18)}${hollow(208,92,c.gold,20)}${hollow(154,138,c.green,17)}${text(72,94,"+",13,c.blue)}${text(198,96,"+",13,c.gold)}${text(147,143,"+",13,c.green)}`),
    "DBSCAN": () => wrap(`${hollow(96,92,c.blue,38,"stroke-dasharray:4 5;")}${dot(82,86,c.blue)}${dot(108,74,c.blue)}${dot(112,106,c.blue)}${hollow(202,86,c.gold,34,"stroke-dasharray:4 5;")}${dot(190,76,c.gold)}${dot(218,92,c.gold)}${dot(206,112,c.gold)}${dot(244,42,c.red,7)}${text(232,34,"noise",9,c.red)}`),
    "Hierarchical": () => wrap(`${axis()}${line(70,132,70,104,c.blue,2)}${line(102,132,102,104,c.blue,2)}${line(70,104,102,104,c.blue,2)}${line(86,104,86,78,c.green,2)}${line(150,132,150,88,c.gold,2)}${line(196,132,196,88,c.gold,2)}${line(150,88,196,88,c.gold,2)}${line(173,88,173,78,c.green,2)}${line(86,78,173,78,c.pink,3)}${[70,102,150,196].map(x=>dot(x,140,c.blue,5)).join("")}${text(112,58,"dendrogram",10,c.ink)}`),
    "Gaussian Mixture": () => wrap(`${path("M72 104 C72 54 150 54 150 104 C150 154 72 154 72 104",c.blue,3,"rgba(0,212,255,.12)")} ${path("M140 94 C140 44 232 44 232 94 C232 144 140 144 140 94",c.gold,3,"rgba(255,183,0,.12)")}${dot(112,102,c.blue,5)}${dot(172,88,c.gold,5)}${dot(148,112,c.green,5)}${text(114,148,"soft clusters",10,c.ink)}`),
    "OPTICS": () => wrap(`${axis()}${path("M52 64 L76 68 L92 126 L118 122 L130 70 L156 74 L174 132 L198 128 L214 58 L248 62",c.pink,4)}${rect(88,122,42,26,"rgba(0,212,255,.24)",3)}${rect(170,128,42,20,"rgba(255,183,0,.28)",3)}${text(82,44,"reachability",10,c.ink)}`),
    "Mean Shift": () => wrap(`${dot(154,82,c.gold,13)}${[line(76,126,138,90,c.blue,2),line(108,58,142,78,c.blue,2),line(218,132,168,94,c.blue,2),line(226,62,172,78,c.blue,2),dot(76,126,c.blue),dot(108,58,c.blue),dot(218,132,c.blue),dot(226,62,c.blue)].join("")}${hollow(154,82,c.gold,44,"stroke-dasharray:5 5;")}${text(132,32,"density peak",10,c.gold)}`),
    "Spectral Clustering": () => wrap(`${[dot(82,70,c.blue),dot(104,104,c.blue),dot(132,78,c.blue),dot(192,72,c.gold),dot(218,104,c.gold),dot(242,78,c.gold)].join("")}${line(82,70,104,104,c.blue,2)}${line(104,104,132,78,c.blue,2)}${line(82,70,132,78,c.blue,2)}${line(192,72,218,104,c.gold,2)}${line(218,104,242,78,c.gold,2)}${line(192,72,242,78,c.gold,2)}${path("M146 90 C162 56 174 124 190 92",c.pink,2,"none","stroke-dasharray:5 6;")}${text(112,148,"graph split",10,c.ink)}`),
    "PCA": () => wrap(`${axis()}${path("M64 130 C96 112 134 92 236 48",c.pink,4)}${line(72,134,236,46,c.gold,2)}${line(140,114,176,48,c.blue,2)}${[dot(90,118,c.blue),dot(126,100,c.blue),dot(164,82,c.blue),dot(202,62,c.blue)].join("")}${text(198,42,"PC1",10,c.gold)}`),
    "t-SNE": () => wrap(`${hollow(92,92,c.blue,34)}${hollow(206,86,c.gold,36)}${[dot(76,86,c.blue),dot(102,72,c.blue),dot(112,104,c.blue),dot(190,78,c.gold),dot(218,70,c.gold),dot(224,106,c.gold)].join("")}${text(84,142,"local neighbors stay close",10,c.ink)}`),
    "UMAP": () => wrap(`${[dot(70,96,c.blue),dot(102,68,c.blue),dot(138,86,c.green),dot(176,70,c.gold),dot(218,98,c.gold),dot(244,70,c.gold)].join("")}${line(70,96,102,68,c.blue,2)}${line(102,68,138,86,c.green,2)}${line(138,86,176,70,c.green,2)}${line(176,70,218,98,c.gold,2)}${line(218,98,244,70,c.gold,2)}${path("M70 128 C116 150 192 150 244 122",c.pink,3)}${text(100,42,"fuzzy graph",10,c.ink)}`),
    "Kernel PCA": () => wrap(`${axis()}${path("M58 122 C96 42 158 152 236 54",c.blue,4)}${line(64,132,238,46,c.gold,2)}${path("M70 120 L86 108 M126 104 L144 94 M190 82 L208 70",c.pink,2)}${text(176,145,"kernel map",10,c.ink)}`),
    "Factor Analysis": () => wrap(`${dot(105,76,c.gold,13)}${dot(195,76,c.green,13)}${[70,110,150,190,230].map((x,i)=>`${line(i<3?105:195,88,x,132,i<3?c.gold:c.green,2)}${rect(x-10,132,20,24,i<3?c.gold:c.green,5)}`).join("")}${text(83,52,"F1",10,"#07111e")}${text(186,52,"F2",10,"#07111e")}`),
    "FastICA": () => wrap(`${path("M48 62 C72 38 96 86 120 62 C144 38 168 86 192 62 C216 38 240 86 264 62",c.blue,3)}${path("M48 124 C72 100 96 148 120 124 C144 100 168 148 192 124 C216 100 240 148 264 124",c.gold,3)}${line(136,82,164,104,c.pink,3)}${text(104,94,"separate sources",10,c.ink)}`),
    "NMF": () => wrap(`${rect(58,54,66,72,c.blue,6,"opacity:.75")}${text(82,94,"X",16,"#07111e",900)}${text(132,96,"=",16,c.ink,900)}${rect(158,54,34,72,c.green,6)}${text(170,94,"W",13,"#07111e",900)}${text(198,96,"x",14,c.ink,900)}${rect(218,66,56,36,c.gold,6)}${text(236,90,"H",13,"#07111e",900)}${text(82,146,"non-negative parts",10,c.ink)}`),
    "Truncated SVD": () => wrap(`${rect(44,50,52,84,c.blue,6)}${text(64,96,"X",15,"#07111e",900)}${text(104,96,"≈",16,c.ink,900)}${rect(128,50,34,84,c.green,6)}${text(140,96,"U",13,"#07111e",900)}${rect(176,68,34,48,c.gold,6)}${text(188,96,"S",13,"#07111e",900)}${rect(224,58,46,64,c.pink,6)}${text(236,96,"Vt",13,"#07111e",900)}${text(96,148,"top singular directions",10,c.ink)}`),
    "Neural Network": () => wrap(`${network([3,4,4,2],[c.gold,c.green])}${text(110,154,"layers learn features",10,c.ink)}`),
    "MLP Classifier": () => wrap(`${network([3,5,3],[c.blue,c.gold,c.green])}${rect(218,44,44,70,"rgba(255,183,0,.18)",8)}${text(224,132,"class p",10,c.gold)}`),
    "MLP Regressor": () => wrap(`${network([3,4,1],[c.pink])}${path("M210 130 A38 38 0 0 1 260 130",c.gold,4)}${line(235,130,250,104,c.red,3)}${text(216,150,"number",10,c.ink)}`),
    "Isolation Forest": () => wrap(`${rect(58,48,184,96,"rgba(0,212,255,.08)",0,"stroke:#00d4ff;stroke-width:2;fill:rgba(0,212,255,.08)")} ${line(114,48,114,144,c.green,2)}${line(58,96,242,96,c.green,2)}${line(198,48,198,96,c.gold,2)}${dot(86,70,c.blue)}${dot(142,118,c.blue)}${dot(214,68,c.red,8)}${text(202,38,"fast isolate",9,c.red)}`),
    "Local Outlier Factor": () => wrap(`${hollow(130,92,c.blue,46)}${[dot(100,76,c.blue),dot(118,112,c.blue),dot(150,78,c.blue),dot(162,114,c.blue)].join("")}${dot(222,58,c.red,8)}${hollow(222,58,c.red,22,"stroke-dasharray:4 5;")}${text(82,150,"local density",10,c.ink)}${text(205,92,"low density",9,c.red)}`),
    "One-Class SVM": () => wrap(`${path("M74 108 C58 58 118 38 170 50 C232 64 244 126 188 142 C134 156 88 146 74 108",c.green,4,"rgba(0,229,160,.12)")} ${[dot(112,88,c.blue),dot(142,72,c.blue),dot(178,94,c.blue),dot(158,126,c.blue)].join("")}${dot(242,48,c.red,7)}${text(214,38,"outside",9,c.red)}`),
    "Elliptic Envelope": () => wrap(`${path("M72 100 C72 52 230 52 230 100 C230 148 72 148 72 100",c.gold,4,"rgba(255,183,0,.12)")} ${[dot(112,94,c.blue),dot(146,78,c.blue),dot(178,108,c.blue),dot(156,124,c.blue)].join("")}${dot(238,42,c.red,7)}${text(108,154,"Gaussian ellipse",10,c.ink)}`),
    "Gradient Descent": () => wrap(`${path("M46 142 C76 72 116 136 150 78 C184 24 224 70 256 38",c.green,4)}${[dot(70,126,c.red),dot(104,104,c.gold),dot(138,86,c.gold),dot(176,64,c.blue),dot(224,44,c.blue)].join("")}${text(94,42,"steps downhill",10,c.ink)}`),
    "Stochastic GD": () => wrap(`${axis()}${path("M58 130 L86 100 L112 118 L138 82 L166 96 L194 58 L230 48",c.red,4)}${[58,86,112,138,166,194,230].map((x,i)=>dot(x,[130,100,118,82,96,58,48][i],i<3?c.gold:c.blue,4)).join("")}${text(104,152,"mini-batch noise",10,c.ink)}`),
    "Adam Optimizer": () => wrap(`${axis()}${path("M58 132 C82 104 108 92 136 82 C166 70 194 58 234 46",c.green,5)}${path("M58 132 L88 94 L116 102 L144 74 L176 76 L210 48",c.soft,2)}${text(112,152,"momentum + scale",10,c.ink)}`),
    "Label Propagation": () => wrap(`${dot(78,84,c.blue)}${dot(212,84,c.gold)}${hollow(116,112,c.blue)}${hollow(154,66,c.green)}${hollow(190,120,c.gold)}${line(78,84,116,112,c.blue,2)}${line(78,84,154,66,c.green,2)}${line(212,84,190,120,c.gold,2)}${line(154,66,212,84,c.gold,2)}${text(90,148,"labels flow",10,c.ink)}`),
    "Label Spreading": () => wrap(`${dot(76,82,c.blue)}${dot(224,82,c.gold)}${dot(118,104,"rgba(0,212,255,.72)",8)}${dot(154,86,"rgba(0,229,160,.72)",8)}${dot(190,106,"rgba(255,183,0,.72)",8)}${path("M84 84 C124 132 176 132 218 84",c.pink,3)}${text(92,148,"soft blended labels",10,c.ink)}`),
    "Self-Training": () => wrap(`${rect(54,58,58,36,c.blue,8)}${text(67,81,"train",10,"#07111e")}${line(114,76,152,76,c.gold,3)}${rect(154,58,70,36,c.green,8)}${text(162,81,"pseudo",10,"#07111e")}${path("M190 98 C170 134 98 134 82 98",c.pink,3)}${dot(236,76,c.gold,8)}${text(222,104,"high p",9,c.gold)}`),
    "Q-Learning": () => wrap(`${[0,1,2].map(r=>[0,1,2].map(col=>rect(88+col*42,42+r*34,38,30,(r===2&&col===2)?c.green:(r===1&&col===1)?c.red:"rgba(255,255,255,.09)",4,"stroke:rgba(255,255,255,.28);stroke-width:1;fill:"+((r===2&&col===2)?c.green:(r===1&&col===1)?c.red:"rgba(255,255,255,.09)"))).join("")).join("")}${path("M104 56 L146 56 L188 56 L188 90 L188 124",c.gold,4)}${text(197,132,"R",11,"#07111e",900)}${text(108,154,"max future reward",10,c.ink)}`),
    "SARSA": () => wrap(`${[0,1,2].map(r=>[0,1,2].map(col=>rect(88+col*42,42+r*34,38,30,(r===2&&col===2)?c.green:"rgba(255,255,255,.09)",4,"stroke:rgba(255,255,255,.28);stroke-width:1;fill:"+((r===2&&col===2)?c.green:"rgba(255,255,255,.09)"))).join("")).join("")}${path("M104 56 L146 56 L146 90 L188 90 L188 124",c.pink,4)}${dot(146,90,c.gold,6)}${text(106,154,"actual next action",10,c.ink)}`),
    "Birch": () => wrap(`${dot(150,48,c.gold,11)}${line(150,60,100,100,c.gold,2)}${line(150,60,200,100,c.gold,2)}${dot(100,104,c.green,10)}${dot(200,104,c.green,10)}${[dot(74,138,c.blue,5),dot(96,142,c.blue,5),dot(122,136,c.blue,5),dot(178,138,c.pink,5),dot(202,142,c.pink,5),dot(226,136,c.pink,5)].join("")}${text(112,28,"CF tree",10,c.ink)}`),
    "Mini-Batch K-Means": () => wrap(`${[dot(76,76,c.blue),dot(94,96,c.blue),dot(204,82,c.gold),dot(222,104,c.gold),dot(150,132,c.green)].join("")}${rect(62,58,50,54,"rgba(0,212,255,.12)",8,"stroke:#00d4ff;stroke-width:2;fill:rgba(0,212,255,.12)")} ${rect(190,66,48,54,"rgba(255,183,0,.12)",8,"stroke:#ffb700;stroke-width:2;fill:rgba(255,183,0,.12)")} ${text(120,150,"small batch update",10,c.ink)}`),
    "Apriori": () => wrap(`${dot(150,48,c.gold,9)}${line(150,58,96,94,c.gold,2)}${line(150,58,150,94,c.gold,2)}${line(150,58,204,94,c.gold,2)}${dot(96,98,c.blue,8)}${dot(150,98,c.blue,8)}${dot(204,98,c.blue,8)}${line(96,108,128,136,c.blue,2)}${line(150,108,128,136,c.blue,2)}${line(150,108,182,136,c.blue,2)}${line(204,108,182,136,c.blue,2)}${dot(128,140,c.green,8)}${dot(182,140,c.green,8)}${text(106,28,"itemset levels",10,c.ink)}`),
    "FP-Growth": () => wrap(`${dot(150,42,c.gold,10)}${line(150,54,104,84,c.gold,2)}${line(150,54,194,84,c.gold,2)}${dot(104,88,c.blue,9)}${dot(194,88,c.green,9)}${line(104,98,84,128,c.blue,2)}${line(104,98,130,128,c.blue,2)}${line(194,98,178,128,c.green,2)}${line(194,98,222,128,c.green,2)}${dot(84,132,c.pink,7)}${dot(130,132,c.pink,7)}${dot(178,132,c.gold,7)}${dot(222,132,c.gold,7)}${text(112,160,"compressed FP-tree",10,c.ink)}`),
    "Bayesian Ridge": () => wrap(`${axis()}${path("M64 126 C116 98 174 72 238 48",c.gold,4)}${path("M64 104 C116 82 174 58 238 32",c.soft,2)}${path("M64 148 C116 118 174 90 238 68",c.soft,2)}${[dot(82,118,c.blue),dot(126,98,c.blue),dot(178,76,c.blue),dot(222,58,c.blue)].join("")}${text(174,150,"uncertainty band",10,c.ink)}`),
    "Elastic Net": () => wrap(`${axis()}${rect(62,72,16,76,c.blue,4)}${rect(92,100,16,48,c.green,4)}${rect(122,136,16,12,c.gold,4)}${rect(152,144,16,4,c.red,2)}${path("M188 52 L238 52 L238 132 L188 132 Z",c.pink,3,"rgba(224,64,251,.08)")} ${text(194,88,"L1",10,c.pink)}${text(214,112,"L2",10,c.gold)}`),
    "Gradient Descent (vis)": () => wrap(`${path("M44 144 C92 52 128 150 174 72 C204 22 232 66 260 36",c.blue,4)}${path("M70 126 L102 104 L132 92 L164 74 L206 50 L244 38",c.gold,3)}${[70,102,132,164,206,244].map((x,i)=>dot(x,[126,104,92,74,50,38][i],i<2?c.red:c.green,5)).join("")}${text(94,154,"loss path",10,c.ink)}`)
  };

  if(visuals[label]) return visuals[label]();

  switch(algo.family){
    case "regression": return visuals["Linear Regression"]();
    case "classification": return visuals["Logistic Regression"]();
    case "ensemble": return visuals["Random Forest"]();
    case "clustering": return visuals["K-Means"]();
    case "dimension": return visuals["PCA"]();
    case "deep": return visuals["Neural Network"]();
    case "anomaly": return visuals["Isolation Forest"]();
    case "optimization": return visuals["Gradient Descent"]();
    case "semi": return visuals["Label Propagation"]();
    case "rl": return visuals["Q-Learning"]();
    case "association": return visuals["Apriori"]();
    default: return wrap(dot(150,90,c.blue,10));
  }
}

function setAlgoVisual(type){
  const visual = document.getElementById("algoVisual");
  if(!visual) return;

  const algo = typeof type === "string"
    ? algoVisualMap[type] || {name: type, family: "classification"}
    : type;

  visual.innerHTML = algoVisualMarkup(algo);
}

document.querySelectorAll(".algo-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    setAlgoVisual(chip.dataset.algo);
  });
});


/* =========================
   SCROLL STATE MICRO EFFECT
========================= */
let scrollTimer;

window.addEventListener("scroll", () => {
  document.body.classList.add("scrolling");

  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    document.body.classList.remove("scrolling");
  }, 180);
});


/* =========================
   COMPLETE VISUALIZER EXPLAINER
========================= */
(function buildVisualizerAlgorithmGuide(){
  const stack = document.querySelector("#algorithms .algo-stack");
  const explainer = document.getElementById("algorithmExplainer");
  const titleEl = document.getElementById("algoTitle");
  const textEl = document.getElementById("algoText");
  if(!stack || !explainer || !titleEl || !textEl) return;

  const visualAlgos = [
    {name:"Logistic Regression", group:"Supervised", family:"classification"},
    {name:"Decision Tree", group:"Supervised", family:"classification"},
    {name:"KNN", group:"Supervised", family:"classification"},
    {name:"Naive Bayes", group:"Supervised", family:"classification"},
    {name:"SVM (RBF)", group:"Supervised", family:"classification"},
    {name:"Perceptron", group:"Supervised", family:"classification"},
    {name:"Ridge Classifier", group:"Supervised", family:"classification"},
    {name:"Linear Regression", group:"Supervised", family:"regression"},
    {name:"Polynomial Regression", group:"Supervised", family:"regression"},
    {name:"Ridge / Lasso", group:"Supervised", family:"regression"},
    {name:"Random Forest", group:"Ensemble", family:"ensemble"},
    {name:"AdaBoost", group:"Ensemble", family:"ensemble"},
    {name:"Gradient Boosting", group:"Ensemble", family:"ensemble"},
    {name:"XGBoost", group:"Ensemble", family:"ensemble"},
    {name:"K-Means", group:"Unsupervised", family:"clustering"},
    {name:"DBSCAN", group:"Unsupervised", family:"clustering"},
    {name:"Hierarchical", group:"Unsupervised", family:"clustering"},
    {name:"Gaussian Mixture", group:"Unsupervised", family:"clustering"},
    {name:"OPTICS", group:"Unsupervised", family:"clustering"},
    {name:"Mean Shift", group:"Unsupervised", family:"clustering"},
    {name:"Spectral Clustering", group:"Unsupervised", family:"clustering"},
    {name:"PCA", group:"Dim. Reduction", family:"dimension"},
    {name:"t-SNE", group:"Dim. Reduction", family:"dimension"},
    {name:"UMAP", group:"Dim. Reduction", family:"dimension"},
    {name:"Kernel PCA", group:"Dim. Reduction", family:"dimension"},
    {name:"Factor Analysis", group:"Dim. Reduction", family:"dimension"},
    {name:"FastICA", group:"Dim. Reduction", family:"dimension"},
    {name:"NMF", group:"Dim. Reduction", family:"dimension"},
    {name:"Truncated SVD", group:"Dim. Reduction", family:"dimension"},
    {name:"Neural Network", group:"Deep Learning", family:"deep"},
    {name:"MLP Classifier", group:"Deep Learning", family:"deep"},
    {name:"MLP Regressor", group:"Deep Learning", family:"deep"},
    {name:"Isolation Forest", group:"Anomaly", family:"anomaly"},
    {name:"Local Outlier Factor", group:"Anomaly", family:"anomaly"},
    {name:"One-Class SVM", group:"Anomaly", family:"anomaly"},
    {name:"Elliptic Envelope", group:"Anomaly", family:"anomaly"},
    {name:"Gradient Descent", group:"Optimization", family:"optimization"},
    {name:"Stochastic GD", group:"Optimization", family:"optimization"},
    {name:"Adam Optimizer", group:"Optimization", family:"optimization"},
    {name:"Label Propagation", group:"Semi-supervised", family:"semi"},
    {name:"Label Spreading", group:"Semi-supervised", family:"semi"},
    {name:"Self-Training", group:"Semi-supervised", family:"semi"},
    {name:"Q-Learning", group:"RL", family:"rl"},
    {name:"SARSA", group:"RL", family:"rl"},
    {name:"Birch", group:"Unsupervised", family:"clustering"},
    {name:"Mini-Batch K-Means", group:"Unsupervised", family:"clustering"},
    {name:"Apriori", group:"Association", family:"association"},
    {name:"FP-Growth", group:"Association", family:"association"},
    {name:"Bayesian Ridge", group:"Supervised", family:"regression"},
    {name:"Elastic Net", group:"Supervised", family:"regression"},
    {name:"Gradient Descent (vis)", group:"Optimization", family:"optimization"}
  ];

  const familyBase = {
    classification: {
      short: "A classification algorithm learns from examples and then chooses a category, like yes/no, spam/not spam, or pass/fail.",
      how: "It studies rows that already have labels, learns a boundary between classes, and uses that boundary for new rows.",
      formula: "class = argmax P(class | features)",
      use: "Use it when your target column is a name or category.",
      example: "Given attendance, marks, and assignments, predict whether a student is Pass or Fail.",
      demo: "Move the slider as model confidence. Above 50%, the demo chooses Class A."
    },
    regression: {
      short: "A regression algorithm predicts a number, such as price, score, demand, salary, or temperature.",
      how: "It looks for a pattern between input columns and a numeric target, then draws a rule that gives the closest number.",
      formula: "y_hat = b0 + b1*x1 + b2*x2 + ...",
      use: "Use it when the answer you want is numeric.",
      example: "Use house size, rooms, and location score to predict house price.",
      demo: "Move the slider as study hours. The demo turns it into a predicted exam score."
    },
    ensemble: {
      short: "An ensemble combines many small models so the final answer is usually stronger than one model alone.",
      how: "Several trees or learners vote, average, or correct each other step by step.",
      formula: "final_prediction = combine(model1, model2, ..., modelN)",
      use: "Use it for strong accuracy on table-style datasets.",
      example: "Predict customer churn by combining many decision trees instead of trusting one tree.",
      demo: "Move the slider as number of voters. More voters usually makes the answer steadier."
    },
    clustering: {
      short: "Clustering finds natural groups when your dataset has no answer column.",
      how: "It compares rows by distance or density and puts similar rows near the same group.",
      formula: "minimize sum distance(point, group_center)",
      use: "Use it for customer segments, pattern discovery, or grouping similar records.",
      example: "Group shoppers into budget, regular, and premium customers from purchase behavior.",
      demo: "Move the slider to increase how many groups the demo searches for."
    },
    dimension: {
      short: "Dimensionality reduction compresses many columns into fewer important directions.",
      how: "It keeps the strongest patterns and removes repeated or noisy information.",
      formula: "compressed_data = original_data * new_axes",
      use: "Use it before visualization or when a dataset has too many columns.",
      example: "Turn 64 pixel columns from digit images into 2 useful visual coordinates.",
      demo: "Move the slider as information kept after compression."
    },
    deep: {
      short: "A neural network learns layered patterns, from simple signals to more complex ideas.",
      how: "Data moves through layers; each layer adjusts weights during training to reduce error.",
      formula: "output = activation(W*x + b)",
      use: "Use it for flexible pattern learning, especially when relationships are not simple.",
      example: "Recognize a digit from pixel values or predict a number from many mixed signals.",
      demo: "Move the slider as training progress. Higher progress means smaller error."
    },
    anomaly: {
      short: "Anomaly detection looks for records that do not behave like the normal group.",
      how: "It learns what normal data looks like, then gives unusual rows a higher anomaly score.",
      formula: "anomaly_score = unusualness(row)",
      use: "Use it for fraud, faulty sensors, suspicious logins, or rare mistakes.",
      example: "Find a transaction that is much larger and in a strange location.",
      demo: "Move the slider as unusualness. High values become alerts."
    },
    optimization: {
      short: "Optimization is how many ML models learn. It keeps changing weights to reduce mistakes.",
      how: "The model measures error, calculates which way improves it, and takes a small step.",
      formula: "θ = θ - η∇L(θ)",
      use: "Use it to understand training speed, learning rate, and why models improve slowly.",
      example: "A line starts badly, then moves until prediction error becomes small.",
      demo: "Move the slider as learning rate. Too tiny is slow, too high can jump around."
    },
    semi: {
      short: "Semi-supervised learning uses a few labelled rows plus many unlabelled rows.",
      how: "It spreads known labels to nearby similar points, or teaches itself using confident predictions.",
      formula: "new_labels = spread(labels over similarity_graph)",
      use: "Use it when labelling every row is expensive.",
      example: "Label 20 medical images, then use 2,000 unlabelled images to improve learning.",
      demo: "Move the slider as labelled data percent. More labels make spreading safer."
    },
    rl: {
      short: "Reinforcement learning teaches an agent by rewards and penalties instead of fixed answers.",
      how: "The agent tries actions, receives reward, and remembers which action helped in each state.",
      formula: "Q(s,a) = Q(s,a) + alpha * (reward + gamma * future - Q(s,a))",
      use: "Use it for games, route planning, robot choices, or step-by-step decisions.",
      example: "A robot learns which direction reaches the goal with fewer penalties.",
      demo: "Move the slider as reward. Higher reward makes the action more attractive."
    },
    association: {
      short: "Association rules find items that often appear together.",
      how: "The algorithm counts repeated item sets and turns strong patterns into if-then rules.",
      formula: "confidence(A -> B) = support(A and B) / support(A)",
      use: "Use it for market basket analysis or recommendation hints.",
      example: "People who buy bread and butter often also buy milk.",
      demo: "Move the slider as minimum support. Higher support keeps only common patterns."
    }
  };

  const overrides = {
    "Logistic Regression": {formula:"p = 1 / (1 + exp(-(b0 + b1*x1 + ...)))", how:"It turns inputs into a probability between 0 and 1, then chooses the class using a threshold like 50%."},
    "Decision Tree": {formula:"choose split with lowest impurity", how:"It asks simple yes/no questions, like income > 50000, until each branch has a clear answer."},
    "KNN": {formula:"prediction = vote of k nearest rows", how:"It does not build a complex rule. It checks the nearest old examples and copies the majority answer."},
    "Naive Bayes": {formula:"P(class | data) is proportional to P(class) * product P(feature | class)", how:"It uses probability and assumes features act mostly independently."},
    "SVM (RBF)": {formula:"decision = sign(sum alpha_i * K(x_i, x) + b)", how:"It finds a wide safety gap between classes. RBF lets the boundary bend around curves."},
    "Perceptron": {formula:"w = w + η(y - y_hat)x", how:"It is a tiny neural model that updates when it makes a mistake."},
    "Ridge Classifier": {formula:"L(w) + λ||w||_2^2", how:"It is a linear classifier that keeps weights small so the model stays stable."},
    "Linear Regression": {formula:"y_hat = m*x + b", how:"It finds the best straight line through numeric data."},
    "Polynomial Regression": {formula:"y_hat = b0 + b1*x + b2*x^2 + ...", how:"It adds curved features, so a line model can fit a curve."},
    "Ridge / Lasso": {formula:"Ridge: L + λ||w||_2^2, Lasso: L + λ||w||_1", how:"Both are linear regression with guardrails. Ridge shrinks weights; Lasso can remove weak features."},
    "Random Forest": {formula:"final = majority_vote(tree_1 ... tree_N)", how:"It trains many trees on slightly different data and lets them vote."},
    "AdaBoost": {formula:"final = sign(sum alpha_t * weak_model_t)", how:"Each new weak model focuses more on rows the previous models got wrong."},
    "Gradient Boosting": {formula:"F_t = F_(t-1) + η h_t(x)", how:"It adds one small tree at a time to fix the remaining mistakes."},
    "XGBoost": {formula:"objective = training_loss + regularization", how:"It is gradient boosting with extra speed, regularization, and careful tree building."},
    "K-Means": {formula:"repeat: assign to nearest center, then move centers", how:"It places K centers and keeps moving them until groups settle."},
    "DBSCAN": {formula:"cluster if neighbors within eps >= min_points", how:"It grows clusters from dense areas and marks lonely points as noise."},
    "Hierarchical": {formula:"merge closest clusters step by step", how:"It starts with every point alone and keeps merging the closest groups."},
    "Gaussian Mixture": {formula:"P(x) = sum pi_k * Normal(x | mean_k, covariance_k)", how:"It assumes data came from several soft bell-shaped groups."},
    "OPTICS": {formula:"order points by reachability distance", how:"It is like DBSCAN, but better when clusters have different densities."},
    "Mean Shift": {formula:"point = mean(points inside window)", how:"Each point slides toward a dense hill of nearby points."},
    "Spectral Clustering": {formula:"graph -> Laplacian -> eigenvectors -> K-Means", how:"It turns data into a similarity graph, then clusters using graph structure."},
    "PCA": {formula:"new_axis = direction with maximum variance", how:"It rotates the data to directions that explain the most spread."},
    "t-SNE": {formula:"preserve neighbor probabilities", how:"It tries to keep close neighbors close in 2D, useful for visual maps."},
    "UMAP": {formula:"preserve fuzzy neighbor graph", how:"It builds a neighbor graph and recreates that graph in fewer dimensions."},
    "Kernel PCA": {formula:"PCA on kernel similarity matrix K", how:"It performs PCA after measuring non-linear similarity."},
    "Factor Analysis": {formula:"X = factors * loadings + noise", how:"It explains many observed columns using fewer hidden factors."},
    "FastICA": {formula:"maximize non-Gaussian independence", how:"It separates mixed signals into independent sources."},
    "NMF": {formula:"X approx W * H, with W >= 0 and H >= 0", how:"It breaks data into additive parts, with no negative pieces."},
    "Truncated SVD": {formula:"X approx U * S * V^T", how:"It keeps only the strongest singular directions, often for sparse text data."},
    "Isolation Forest": {formula:"shorter isolation path means more anomalous", how:"It randomly splits data. Strange points get isolated faster."},
    "Local Outlier Factor": {formula:"LOF = local density of neighbors / local density of point", how:"It compares a row's density to nearby rows."},
    "One-Class SVM": {formula:"decision = sign(w * phi(x) - rho)", how:"It learns a boundary around normal data only."},
    "Elliptic Envelope": {formula:"distance = (x-mean)^T covariance^-1 (x-mean)", how:"It draws an ellipse around normal Gaussian-like data."},
    "Stochastic GD": {formula:"weight = weight - lr * gradient(one mini batch)", how:"It updates using small batches, so learning is faster but noisier."},
    "Adam Optimizer": {formula:"step uses moving average of gradients and squared gradients", how:"It adapts step size using momentum and recent gradient size."},
    "Label Propagation": {formula:"labels flow across a similarity graph", how:"Known labels spread to nearby unlabelled rows."},
    "Label Spreading": {formula:"Y = α*S*Y + (1-α)*Y0", how:"It spreads labels more gently and keeps some original label strength."},
    "Self-Training": {formula:"train -> pseudo-label confident rows -> train again", how:"The model labels easy unlabelled rows for itself, then retrains."},
    "Q-Learning": {formula:"Q(s,a) = Q(s,a) + alpha * (r + gamma * max Q(s2,a2) - Q(s,a))", how:"It learns the best action even while exploring random moves."},
    "SARSA": {formula:"Q(s,a) = Q(s,a) + alpha * (r + gamma * Q(s2,a2) - Q(s,a))", how:"It learns from the action it actually takes, so it can behave more cautiously."},
    "Birch": {formula:"CF = (N, linear_sum, squared_sum)", how:"It stores compact cluster summaries in a tree, good for large datasets."},
    "Mini-Batch K-Means": {formula:"update centers using small random batches", how:"It is K-Means made faster by updating with small chunks of data."},
    "Apriori": {formula:"support(itemset) = count(itemset) / total_transactions", how:"It grows frequent item sets level by level and prunes rare sets."},
    "FP-Growth": {formula:"transactions -> FP-tree -> frequent patterns", how:"It compresses transactions into a tree and mines patterns without generating every candidate."},
    "Bayesian Ridge": {formula:"Ridge regression with probability over weights", how:"It estimates both prediction and uncertainty while controlling weight size."},
    "Elastic Net": {formula:"L + λ(α||w||_1 + (1-α)||w||_2^2)", how:"It blends Lasso feature selection with Ridge stability."},
    "Gradient Descent (vis)": {formula:"θ = θ - η∇L(θ)", how:"It is the visual version of training steps moving downhill on error."}
  };

  const groupIntro = {
    "Supervised": "Algorithms that learn from rows with answers.",
    "Ensemble": "Algorithms that combine many small learners.",
    "Unsupervised": "Algorithms that discover structure without labels.",
    "Dim. Reduction": "Algorithms that simplify many columns.",
    "Deep Learning": "Layered models that learn complex patterns.",
    "Anomaly": "Algorithms that find unusual records.",
    "Optimization": "Training methods that reduce model error.",
    "Semi-supervised": "Algorithms that mix labelled and unlabelled data.",
    "RL": "Agents that learn from reward.",
    "Association": "Algorithms that discover items that appear together."
  };

  const algorithmFormulas = {
    "Logistic Regression": "p = 1 / (1 + e^{-(b0 + b1 x1 + ... )})",
    "Decision Tree": "select split with lowest impurity",
    "KNN": "prediction = majority(votes of k nearest neighbors)",
    "Naive Bayes": "P(class | x) ∝ P(class) · Π P(feature_i | class)",
    "SVM (RBF)": "decision = sign(Σ α_i K(x_i, x) + b)",
    "Perceptron": "w ← w + η (y - ŷ) x",
    "Ridge Classifier": "loss + λ Σ w_i²",
    "Linear Regression": "ŷ = m x + b",
    "Polynomial Regression": "ŷ = b0 + b1 x + b2 x² + ...",
    "Ridge / Lasso": "Ridge: loss + λ Σ w², Lasso: loss + λ Σ |w|",
    "Random Forest": "final = majority_vote(tree_1, ..., tree_N)",
    "AdaBoost": "F(x) = sign(Σ α_t h_t(x))",
    "Gradient Boosting": "F_{new} = F_{old} + η · model(residuals)",
    "XGBoost": "objective = training_loss + regularization",
    "K-Means": "minimize Σ ||x - centroid_k||²",
    "DBSCAN": "cluster if neighbors within ε ≥ minPts",
    "Hierarchical": "merge closest clusters until one tree remains",
    "Gaussian Mixture": "p(x) = Σ π_k · 𝒩(x | μ_k, Σ_k)",
    "OPTICS": "order points by reachability distance",
    "Mean Shift": "centroid ← mean(points inside window)",
    "Spectral Clustering": "graph → Laplacian → eigenvectors → K-Means",
    "PCA": "z = X W, where W are top eigenvectors",
    "t-SNE": "preserve neighbor probabilities in low D",
    "UMAP": "preserve fuzzy neighbor graph",
    "Kernel PCA": "PCA on kernel matrix K(x_i, x_j)",
    "Factor Analysis": "X ≈ factors · loadings + noise",
    "FastICA": "maximize non-Gaussian independence",
    "NMF": "X ≈ W H, with W ≥ 0 and H ≥ 0",
    "Truncated SVD": "X ≈ U S V^T",
    "Isolation Forest": "shorter isolation path → more anomalous",
    "Local Outlier Factor": "LOF = density(neighbors) / density(point)",
    "One-Class SVM": "decision = sign(w · φ(x) - ρ)",
    "Elliptic Envelope": "distance = (x-μ)^T Σ^{-1} (x-μ)",
    "Stochastic GD": "w ← w - η ∇ loss(batch)",
    "Adam Optimizer": "w ← w - α m / (√v + ε)",
    "Label Propagation": "labels spread over a similarity graph",
    "Label Spreading": "Y = α*S*Y + (1-α)*Y0",
    "Self-Training": "train, pseudo-label confident rows, retrain",
    "Q-Learning": "Q(s,a) ← Q(s,a) + α [r + γ max_a' Q(s',a') - Q(s,a)]",
    "SARSA": "Q(s,a) ← Q(s,a) + α [r + γ Q(s',a') - Q(s,a)]",
    "Birch": "CF = (N, linear_sum, squared_sum)",
    "Mini-Batch K-Means": "update centers with small random batches",
    "Apriori": "support(A ∪ B) = count(A ∪ B) / N",
    "FP-Growth": "build FP-tree, mine frequent itemsets"
  };

  const algorithmExamples = {
    "Logistic Regression": "Predict whether a loan application is approved or denied based on income and credit score.",
    "Decision Tree": "Use customer features like age and purchase history to decide whether they are likely to churn.",
    "KNN": "Classify a new flower based on the most similar flowers in the dataset.",
    "Naive Bayes": "Detect spam by comparing word patterns against known spam and non-spam emails.",
    "SVM (RBF)": "Separate two groups of points with a curved boundary when classes are not linearly separable.",
    "Perceptron": "Train a simple binary classifier on linearly separable data such as pass/fail.",
    "Ridge Classifier": "Use when you want a stable linear decision boundary with regularization.",
    "Linear Regression": "Predict housing prices from square footage and number of bedrooms.",
    "Polynomial Regression": "Fit a curved line to price trends that change faster at higher values.",
    "Ridge / Lasso": "Pick the most useful features while keeping predictions stable on noisy data.",
    "Random Forest": "Combine many decision trees to improve prediction accuracy on a complex dataset.",
    "AdaBoost": "Boost weak models by focusing on rows that previous models misclassified.",
    "Gradient Boosting": "Build a strong model by adding trees that correct earlier mistakes.",
    "XGBoost": "Use when you need a fast, regularized boosted tree model for tabular data.",
    "K-Means": "Group customers into segments based on purchasing patterns.",
    "DBSCAN": "Find dense clusters of users while marking isolated outliers as noise.",
    "Hierarchical": "Explore cluster structure step-by-step without choosing K in advance.",
    "Gaussian Mixture": "Model overlapping clusters as soft probability regions.",
    "OPTICS": "Detect clusters with different densities in a dataset.",
    "Mean Shift": "Shift cluster centers toward dense regions until they settle.",
    "Spectral Clustering": "Cluster data using graph connectivity rather than plain distance.",
    "PCA": "Reduce 64 pixel columns from digit images to 2 main directions for visualization.",
    "t-SNE": "Create a 2D map of high-dimensional image features to reveal groups.",
    "UMAP": "Compress data into 2D while preserving local structure for visualization.",
    "Kernel PCA": "Find non-linear components for data that lies on a curve or manifold.",
    "Factor Analysis": "Explain many survey questions using a few hidden factors.",
    "FastICA": "Separate mixed audio signals into independent sources.",
    "NMF": "Break down document-term counts into topics and word patterns.",
    "Truncated SVD": "Compress sparse text data into a smaller latent space.",
    "Isolation Forest": "Detect fraud by isolating abnormal transactions quickly.",
    "Local Outlier Factor": "Compare local densities to find unusual records.",
    "One-Class SVM": "Learn a boundary around normal data only and detect new anomalies.",
    "Elliptic Envelope": "Draw an ellipse around normal Gaussian-like data points.",
    "Stochastic GD": "Train a model using small batches for faster updates.",
    "Adam Optimizer": "Use adaptive step sizes when training deep models.",
    "Label Propagation": "Spread a few labels through a similarity graph to label the rest.",
    "Label Spreading": "Spread labels more gently while keeping original label strength.",
    "Self-Training": "Label confident unlabeled rows and retrain to improve performance.",
    "Q-Learning": "Teach an agent to navigate a maze using rewards and penalties.",
    "SARSA": "Learn from the actions the agent actually takes in a sequence.",
    "Birch": "Build compact cluster summaries for large datasets before final clustering.",
    "Mini-Batch K-Means": "Cluster large data by updating centers with small random batches.",
    "Apriori": "Find frequent item combinations like bread and milk in shopping baskets.",
    "FP-Growth": "Mine frequent patterns using a compressed transaction tree."
  };

  const algorithmDemos = {
    "Logistic Regression": "Move the slider as probability moves from 0% to 100%. Above 50% the demo chooses the positive class.",
    "Decision Tree": "Move the slider to watch simple yes/no rules split the data until a leaf is reached.",
    "KNN": "Slide to change how many neighbors vote. More neighbors make the answer smoother.",
    "Naive Bayes": "Move the slider to change the feature weight and see how probability shifts.",
    "SVM (RBF)": "Slide to bend the decision boundary and separate complex class shapes.",
    "Perceptron": "Move the slider to update the boundary when the model makes a mistake.",
    "Ridge Classifier": "Adjust the slider to see how stronger regularization makes the boundary simpler.",
    "Linear Regression": "Move the slider as input increases and a straight line predicts the output.",
    "Polynomial Regression": "Move the slider to watch the curve bend and fit non-linear trends.",
    "Ridge / Lasso": "Adjust regularization to see weights shrink or disappear.",
    "Random Forest": "Move the slider as more trees vote and the final answer becomes steadier.",
    "AdaBoost": "Slide to show how later models focus on mistakes from earlier ones.",
    "Gradient Boosting": "Move the slider to add one small tree at a time and reduce error.",
    "XGBoost": "Adjust the slider to see a fast, regularized boosted model improve.",
    "K-Means": "Move the slider to search for more or fewer groups in the data.",
    "DBSCAN": "Slide to grow dense clusters while leaving isolated points as noise.",
    "Hierarchical": "Move the slider to cut the cluster tree at different heights.",
    "Gaussian Mixture": "Adjust the slider to change how soft cluster membership is assigned.",
    "OPTICS": "Slide to reveal clusters at different density levels.",
    "Mean Shift": "Move the slider to push points toward dense hills until clusters settle.",
    "Spectral Clustering": "Slide to see connected groups form from the similarity graph.",
    "PCA": "Move the slider as information kept after compression changes.",
    "t-SNE": "Slide to reveal how neighbor structure appears in 2D.",
    "UMAP": "Move the slider to keep local structure while compressing dimensions.",
    "Kernel PCA": "Slide to change how non-linear structure is preserved.",
    "Factor Analysis": "Move the slider to show how many hidden factors explain the data.",
    "FastICA": "Slide to separate mixed signals into clearer independent sources.",
    "NMF": "Move the slider to control how many additive parts explain the data.",
    "Truncated SVD": "Slide to choose how much sparse data is compressed.",
    "Isolation Forest": "Move the slider as isolation paths get shorter for anomalies.",
    "Local Outlier Factor": "Slide to compare a point's density with its neighbors.",
    "One-Class SVM": "Move the slider to shrink or expand the normal boundary.",
    "Elliptic Envelope": "Slide to change the size of the ellipse around normal data.",
    "Stochastic GD": "Move the slider as mini-batch updates make the loss jump and settle.",
    "Adam Optimizer": "Adjust the slider to see adaptive step sizes smooth training.",
    "Label Propagation": "Move the slider as labels spread through the similarity graph.",
    "Label Spreading": "Slide to see soft labels blend neighbor influence and original labels.",
    "Self-Training": "Move the slider as confident predictions label more unlabeled rows.",
    "Q-Learning": "Adjust the slider as reward values make some actions more attractive.",
    "SARSA": "Move the slider as the agent learns from the actions it actually takes.",
    "Birch": "Slide to see compact cluster summaries form in a tree structure.",
    "Mini-Batch K-Means": "Move the slider to update centers with small random groups.",
    "Apriori": "Slide to raise minimum support and keep only the most frequent patterns.",
    "FP-Growth": "Slide to see how strong item patterns remain after mining."
  };

  const algorithmDetails = {
    "Logistic Regression": {
      short: "Logistic Regression predicts a class probability with an S-shaped curve.",
      how: "It builds one score from the input columns, turns that score into probability, then applies a threshold.",
      formula: "z = b0 + w*x\np = 1 / (1 + e^-z)\ny = 1[p >= t]",
      use: "Use it for yes/no decisions where probabilities matter.",
      example: "Estimate whether a loan should be approved from income, debt, and credit score.",
      demo: "Move the slider to change p. The class flips only when p crosses the threshold."
    },
    "Decision Tree": {
      short: "Decision Tree makes predictions by following readable if/else rules.",
      how: "It chooses the split that makes child nodes cleaner, then repeats until a leaf gives the answer.",
      formula: "IG = I(parent) - sum((n_j/n) * I(child_j))",
      use: "Use it when you want simple rules that are easy to explain.",
      example: "Classify customer churn with rules like contract length, support calls, and payment delay.",
      demo: "Move the slider down the tree as each rule sends the sample to a new branch."
    },
    "KNN": {
      short: "KNN predicts by looking at the closest old examples.",
      how: "It measures distance from the new row to stored rows and lets the nearest k rows vote.",
      formula: "d_i = ||x - x_i||\ny = mode(y_1 ... y_k)",
      use: "Use it for small datasets where similar rows should have similar labels.",
      example: "Classify a flower by comparing it with the most similar measured flowers.",
      demo: "Move the slider to change k and watch the neighborhood vote become smoother."
    },
    "Naive Bayes": {
      short: "Naive Bayes combines feature probabilities to choose the most likely class.",
      how: "It starts with the class prior and multiplies the likelihood of each observed feature.",
      formula: "P(c|x) ∝ P(c) * prod P(x_i|c)",
      use: "Use it for fast text, spam, and many-feature classification.",
      example: "Mark an email as spam when words like win, free, and prize strongly support spam.",
      demo: "Move the slider to increase one feature likelihood and watch the posterior change."
    },
    "SVM (RBF)": {
      short: "SVM with RBF creates a curved boundary with the widest safety margin.",
      how: "It uses support vectors and a radial kernel so nearby points influence the boundary more.",
      formula: "f(x) = sign(sum α_i*y_i*K(x_i,x) + b)\nK = e^(-γ||x-x_i||^2)",
      use: "Use it when classes separate with curves rather than a straight line.",
      example: "Separate two product quality groups whose measurements form circular patterns.",
      demo: "Move the slider to change γ and bend the boundary around the classes."
    },
    "Perceptron": {
      short: "Perceptron is a one-layer classifier that learns from its mistakes.",
      how: "When it predicts wrong, it nudges the weight vector toward the correct side.",
      formula: "w = w + η(y-y_hat)x\nb = b + η(y-y_hat)",
      use: "Use it to understand the simplest neural-style linear classifier.",
      example: "Learn a pass/fail boundary when two classes can be separated by a line.",
      demo: "Move the slider as mistakes shrink and the boundary rotates into place."
    },
    "Ridge Classifier": {
      short: "Ridge Classifier is a linear classifier that keeps weights small.",
      how: "It fits a decision boundary while penalizing large coefficients to reduce overfitting.",
      formula: "min L(w) + λ||w||_2^2",
      use: "Use it for many correlated columns where a stable linear model is enough.",
      example: "Classify survey responses when many questions ask similar things.",
      demo: "Move the slider to increase λ and watch the boundary become less sensitive."
    },
    "Linear Regression": {
      short: "Linear Regression predicts a number with a straight-line relationship.",
      how: "It chooses weights that make predicted numbers as close as possible to actual numbers.",
      formula: "y_hat = b0 + w1*x1\nmin sum(y-y_hat)^2",
      use: "Use it when the target is numeric and the trend is mostly straight.",
      example: "Predict house price from square footage and room count.",
      demo: "Move the slider as x increases and the line returns a matching y value."
    },
    "Polynomial Regression": {
      short: "Polynomial Regression fits a curved numeric trend.",
      how: "It adds powers of x as extra features, then trains a linear model on those features.",
      formula: "y_hat = b0 + b1*x + b2*x^2 + b3*x^3",
      use: "Use it when a numeric relationship bends instead of staying straight.",
      example: "Predict sales growth that rises quickly at first and then slows.",
      demo: "Move the slider to add curvature and see the prediction bend."
    },
    "Ridge / Lasso": {
      short: "Ridge and Lasso are regularized regressions for noisy feature sets.",
      how: "Ridge shrinks weights smoothly; Lasso can push weak weights to zero.",
      formula: "Ridge: L + λ||w||_2^2\nLasso: L + λ||w||_1",
      use: "Use them when many features compete or some features should be ignored.",
      example: "Predict price while reducing the effect of weak or duplicated columns.",
      demo: "Move the slider to strengthen λ and watch coefficients shrink or disappear."
    },
    "Random Forest": {
      short: "Random Forest combines many decision trees into one stronger model.",
      how: "Each tree trains on a different sample and feature subset, then the forest votes or averages.",
      formula: "classification: y = mode(T_1(x) ... T_B(x))\nregression: y_hat = mean(T_b(x))",
      use: "Use it as a strong default for tabular data.",
      example: "Predict customer churn by combining many different tree opinions.",
      demo: "Move the slider to add trees and make the final vote steadier."
    },
    "AdaBoost": {
      short: "AdaBoost builds a strong classifier by fixing earlier mistakes.",
      how: "Each weak learner gets more attention on rows the previous learners missed.",
      formula: "F(x) = sign(sum α_t*h_t(x))",
      use: "Use it when simple learners can improve by focusing on hard rows.",
      example: "Improve a weak fraud detector by repeatedly emphasizing missed fraud cases.",
      demo: "Move the slider as sample weights shift toward incorrectly classified points."
    },
    "Gradient Boosting": {
      short: "Gradient Boosting adds small models that correct remaining error.",
      how: "Each new learner fits the residual pattern left by the current model.",
      formula: "F_t(x) = F_(t-1)(x) + η*h_t(x)",
      use: "Use it for accurate predictions when you can tune learning rate and tree count.",
      example: "Forecast demand by adding trees that correct underpredicted days.",
      demo: "Move the slider to add another correction step and reduce residuals."
    },
    "XGBoost": {
      short: "XGBoost is optimized gradient boosting with regularized trees.",
      how: "It grows boosted trees with penalties, pruning, and efficient split scoring.",
      formula: "Obj = sum l(y,y_hat) + sum Ω(f_t)",
      use: "Use it for high-performing tabular models and competitions.",
      example: "Rank credit risk with boosted trees that are fast and carefully regularized.",
      demo: "Move the slider to grow another tree while the penalty controls complexity."
    },
    "K-Means": {
      short: "K-Means groups points around k moving centers.",
      how: "It assigns each point to the nearest center, then moves each center to its group mean.",
      formula: "c_i = argmin_k ||x_i-μ_k||^2\nμ_k = mean(C_k)",
      use: "Use it when you know roughly how many compact groups you want.",
      example: "Segment shoppers into budget, regular, and premium groups.",
      demo: "Move the slider to change k and watch centers claim nearby points."
    },
    "DBSCAN": {
      short: "DBSCAN finds dense clusters and labels sparse points as noise.",
      how: "It grows clusters from core points that have enough neighbors inside ε.",
      formula: "N_ε(p) = {q: d(p,q) <= ε}\ncore(p): |N_ε(p)| >= m",
      use: "Use it for irregular cluster shapes and outlier detection.",
      example: "Group GPS locations while treating isolated pings as noise.",
      demo: "Move the slider to expand ε and turn sparse points into cluster members."
    },
    "Hierarchical": {
      short: "Hierarchical clustering builds a tree of nested groups.",
      how: "It repeatedly merges the closest clusters so you can cut the tree at different levels.",
      formula: "D(A,B) = linkage(A,B)\nmerge argmin D(A,B)",
      use: "Use it when you want to inspect cluster relationships instead of picking k first.",
      example: "Group documents into topics, subtopics, and fine-grained themes.",
      demo: "Move the slider to cut the dendrogram higher or lower."
    },
    "Gaussian Mixture": {
      short: "Gaussian Mixture creates soft overlapping clusters.",
      how: "It estimates several bell-shaped distributions and assigns membership probabilities.",
      formula: "p(x) = sum π_k*N(x|μ_k,Σ_k)",
      use: "Use it when clusters overlap and a point may partly belong to several groups.",
      example: "Model customer segments that blend instead of forming hard boundaries.",
      demo: "Move the slider to shift membership confidence between the mixtures."
    },
    "OPTICS": {
      short: "OPTICS orders points to reveal clusters at many density levels.",
      how: "It tracks reachability distance so dense valleys become visible without one fixed ε.",
      formula: "reach(p) = max(core(o), d(o,p))",
      use: "Use it when DBSCAN struggles because clusters have different densities.",
      example: "Find dense and loose city activity zones in the same GPS dataset.",
      demo: "Move the slider along the reachability plot to reveal density valleys."
    },
    "Mean Shift": {
      short: "Mean Shift moves points uphill toward dense regions.",
      how: "Each step replaces a point with the weighted mean of nearby points in its window.",
      formula: "x = sum K(x_i-x)*x_i / sum K(x_i-x)",
      use: "Use it when cluster centers should be discovered automatically.",
      example: "Find natural color clusters in an image without choosing k.",
      demo: "Move the slider as points slide toward the nearest density peak."
    },
    "Spectral Clustering": {
      short: "Spectral Clustering separates data using graph connectivity.",
      how: "It builds a similarity graph, uses eigenvectors of its Laplacian, then clusters the embedding.",
      formula: "L = D - W\nZ = eig_k(L)\ncluster Z",
      use: "Use it for non-round groups that are connected by graph structure.",
      example: "Separate two intertwined shapes that K-Means would cut badly.",
      demo: "Move the slider to strengthen graph links and watch groups separate."
    },
    "PCA": {
      short: "PCA rotates data into directions that keep the most variance.",
      how: "It finds principal axes and projects rows onto the strongest few axes.",
      formula: "C = X^T X / n\nZ = XW_k",
      use: "Use it to visualize or compress many numeric columns.",
      example: "Show digit images with 64 pixel columns as a 2D map.",
      demo: "Move the slider to keep more components and more explained variance."
    },
    "t-SNE": {
      short: "t-SNE creates a 2D map that preserves close neighbors.",
      how: "It matches high-dimensional neighbor probabilities with low-dimensional ones.",
      formula: "min KL(P || Q)",
      use: "Use it for visual exploration of clusters, not as a general predictor.",
      example: "Map image embeddings so similar digits appear near each other.",
      demo: "Move the slider as neighborhoods tighten into visible islands."
    },
    "UMAP": {
      short: "UMAP compresses data by preserving a fuzzy neighbor graph.",
      how: "It builds a graph in the original space and optimizes a low-dimensional graph to match it.",
      formula: "min CE(G_high, G_low)",
      use: "Use it for fast visual maps that keep local structure.",
      example: "Visualize thousands of customer profiles in two dimensions.",
      demo: "Move the slider to balance local detail against broader structure."
    },
    "Kernel PCA": {
      short: "Kernel PCA performs PCA after a non-linear similarity transform.",
      how: "It builds a kernel matrix so curved structure can become separable in the new space.",
      formula: "K_ij = k(x_i,x_j)\nZ = eig_k(K)",
      use: "Use it when ordinary PCA misses curved manifolds.",
      example: "Unroll a curved dataset before clustering or visualization.",
      demo: "Move the slider to increase kernel influence and straighten the curve."
    },
    "Factor Analysis": {
      short: "Factor Analysis explains many observed columns with fewer hidden factors.",
      how: "It models each feature as a mixture of latent factors plus noise.",
      formula: "X = ZL + E",
      use: "Use it for survey, psychology, or questionnaire data with hidden themes.",
      example: "Reduce many satisfaction questions into service, price, and quality factors.",
      demo: "Move the slider to add latent factors and explain more shared variation."
    },
    "FastICA": {
      short: "FastICA separates mixed signals into independent sources.",
      how: "It rotates the data to maximize non-Gaussian independence between components.",
      formula: "S = WX\nmaximize nonGaussian(S)",
      use: "Use it when observed signals are mixtures of independent original signals.",
      example: "Separate overlapping audio recordings from multiple microphones.",
      demo: "Move the slider as the mixed wave splits into cleaner source waves."
    },
    "NMF": {
      short: "NMF decomposes non-negative data into additive parts.",
      how: "It finds two non-negative matrices whose product reconstructs the original data.",
      formula: "X ≈ WH\nW >= 0, H >= 0",
      use: "Use it for parts-based topics, images, and counts.",
      example: "Break document word counts into topic patterns and document-topic strengths.",
      demo: "Move the slider to add more additive parts to the reconstruction."
    },
    "Truncated SVD": {
      short: "Truncated SVD keeps only the strongest singular directions.",
      how: "It approximates a matrix with low-rank factors, often without centering sparse data.",
      formula: "X_k = U_k S_k V_k^T",
      use: "Use it for sparse text matrices and compact latent features.",
      example: "Compress a document-term matrix into a smaller semantic space.",
      demo: "Move the slider to keep more singular values and recover more detail."
    },
    "Neural Network": {
      short: "Neural Network learns layered transformations from inputs to outputs.",
      how: "Each layer combines weighted inputs, applies an activation, and passes features forward.",
      formula: "a_l = σ(W_l*a_(l-1) + b_l)",
      use: "Use it when simple linear or tree rules are not flexible enough.",
      example: "Recognize a handwritten digit from many pixel values.",
      demo: "Move the slider as layers activate and the final output becomes confident."
    },
    "MLP Classifier": {
      short: "MLP Classifier is a feed-forward neural net for class labels.",
      how: "Hidden layers learn features, and the output layer produces class probabilities.",
      formula: "p = softmax(Wa+b)\nL = -sum y*log(p)",
      use: "Use it for non-linear classification on tabular or vector data.",
      example: "Classify user intent from a row of behavioral signals.",
      demo: "Move the slider as probability mass shifts across output classes."
    },
    "MLP Regressor": {
      short: "MLP Regressor is a neural net that predicts numeric values.",
      how: "Hidden layers learn non-linear features and the final neuron outputs a number.",
      formula: "y_hat = W_L*a_(L-1) + b_L\nL = (y-y_hat)^2",
      use: "Use it for numeric prediction when relationships are complex.",
      example: "Predict energy usage from weather, time, and building signals.",
      demo: "Move the slider as training reduces numeric prediction error."
    },
    "Isolation Forest": {
      short: "Isolation Forest detects anomalies by isolating unusual rows quickly.",
      how: "Random splits isolate rare points in fewer steps than normal crowded points.",
      formula: "score(x) = 2^(-E(h(x))/c(n))",
      use: "Use it for unsupervised fraud, fault, or rare-event detection.",
      example: "Flag transactions that separate from normal spending patterns early.",
      demo: "Move the slider to shorten isolation paths for more suspicious points."
    },
    "Local Outlier Factor": {
      short: "Local Outlier Factor compares a row's density with nearby density.",
      how: "A point is suspicious when its neighborhood is much less dense than its neighbors' neighborhoods.",
      formula: "LOF_k(x) = mean(lrd(n)) / lrd(x)",
      use: "Use it when outliers are local, not globally far away.",
      example: "Find a low-activity server inside a normally busy server group.",
      demo: "Move the slider to compare local density ratios."
    },
    "One-Class SVM": {
      short: "One-Class SVM learns the boundary of normal data only.",
      how: "It maps data to a feature space and separates normal points from the origin/outside region.",
      formula: "f(x) = sign(w*φ(x) - ρ)",
      use: "Use it when you mainly have normal examples and few anomalies.",
      example: "Learn normal machine sensor behavior, then flag future deviations.",
      demo: "Move the slider to expand or shrink the normal boundary."
    },
    "Elliptic Envelope": {
      short: "Elliptic Envelope fits an ellipse around Gaussian-like normal data.",
      how: "It estimates robust mean and covariance, then scores distance from the center.",
      formula: "D^2 = (x-μ)^T Σ^-1 (x-μ)",
      use: "Use it when normal data forms one oval cloud.",
      example: "Flag measurements outside a normal temperature-pressure ellipse.",
      demo: "Move the slider to resize the ellipse and catch farther points."
    },
    "Gradient Descent": {
      short: "Gradient Descent updates parameters in the direction that reduces loss.",
      how: "It computes the loss slope and takes a small step downhill each iteration.",
      formula: "θ = θ - η∇L(θ)",
      use: "Use it to understand how model training improves step by step.",
      example: "Fit a regression line by repeatedly lowering prediction error.",
      demo: "Move the slider to take more downhill steps on the loss curve."
    },
    "Stochastic GD": {
      short: "Stochastic GD updates using small random batches.",
      how: "It estimates the gradient from part of the data, making steps faster but noisier.",
      formula: "θ = θ - η∇L_B(θ)",
      use: "Use it for large datasets where full-gradient updates are expensive.",
      example: "Train a text classifier by updating after each mini-batch of documents.",
      demo: "Move the slider as noisy mini-batch steps bounce toward the minimum."
    },
    "Adam Optimizer": {
      short: "Adam adapts gradient descent using momentum and squared-gradient scale.",
      how: "It keeps moving averages of gradients and gradient size to choose smoother steps.",
      formula: "m_t = β1*m + (1-β1)*g\nv_t = β2*v + (1-β2)*g^2\nθ = θ - η*m_hat/(sqrt(v_hat)+ε)",
      use: "Use it as a common optimizer for neural networks.",
      example: "Train an MLP faster by adapting step sizes for each weight.",
      demo: "Move the slider as momentum smooths the path compared with SGD."
    },
    "Label Propagation": {
      short: "Label Propagation spreads known labels through a similarity graph.",
      how: "Unlabelled points receive labels from connected neighbours until the graph settles.",
      formula: "Y = S*Y\nclamp labelled rows",
      use: "Use it when labels are scarce but many unlabelled rows are available.",
      example: "Label a few images manually and infer labels for similar unlabelled images.",
      demo: "Move the slider as labelled nodes push labels through graph edges."
    },
    "Label Spreading": {
      short: "Label Spreading is a smoother, regularized version of label propagation.",
      how: "It blends graph-spread labels with the original labels instead of fully replacing them.",
      formula: "Y = α*S*Y + (1-α)*Y0",
      use: "Use it when you want semi-supervised labels without overreacting to noisy neighbors.",
      example: "Spread product category labels while keeping trusted manual labels anchored.",
      demo: "Move the slider to blend neighbor influence with original label strength."
    },
    "Self-Training": {
      short: "Self-Training lets a supervised model label confident unlabelled rows.",
      how: "It trains on known labels, adds high-confidence pseudo-labels, then trains again.",
      formula: "fit(X_l,y_l)\nadd rows where max(p) >= τ\nrepeat",
      use: "Use it when a base classifier is decent and unlabelled data is plentiful.",
      example: "Classify support tickets after manually labelling only the clearest examples.",
      demo: "Move the slider as more confident pseudo-labels join training."
    },
    "Q-Learning": {
      short: "Q-Learning learns action values from rewards and best future value.",
      how: "It updates the chosen state-action value toward reward plus the best next action.",
      formula: "Q(s,a) = Q(s,a) + α[r + γ max Q(s',a') - Q(s,a)]",
      use: "Use it for discrete decisions where an agent explores and learns a policy.",
      example: "Teach a maze agent which moves eventually reach the goal.",
      demo: "Move the slider to raise reward and make that action more attractive."
    },
    "SARSA": {
      short: "SARSA learns from the action the agent actually takes next.",
      how: "It updates using the next sampled action, so exploration risk is part of learning.",
      formula: "Q(s,a) = Q(s,a) + α[r + γ Q(s',a') - Q(s,a)]",
      use: "Use it when the learning policy should account for its own exploration behavior.",
      example: "Train a route agent that avoids risky shortcuts while still exploring.",
      demo: "Move the slider as the actual next action changes the update."
    },
    "Birch": {
      short: "Birch clusters large datasets with compact cluster-feature summaries.",
      how: "It stores counts, sums, and squared sums in a tree before final clustering.",
      formula: "CF = (n, LS, SS)",
      use: "Use it for large datasets where full pairwise clustering is too expensive.",
      example: "Compress millions of customer points into small cluster summaries.",
      demo: "Move the slider as leaf summaries grow into a compact CF tree."
    },
    "Mini-Batch K-Means": {
      short: "Mini-Batch K-Means is K-Means updated from small random batches.",
      how: "It moves centers using only a mini-batch at a time, trading exactness for speed.",
      formula: "μ_k = μ_k + η(x_i - μ_k)",
      use: "Use it for fast clustering on large datasets.",
      example: "Cluster thousands of product embeddings without scanning all rows every step.",
      demo: "Move the slider as each mini-batch nudges the centers."
    },
    "Apriori": {
      short: "Apriori finds frequent itemsets by growing only patterns that stay common.",
      how: "It prunes any larger itemset if one of its smaller subsets is already rare.",
      formula: "support(A) = count(A)/N\nkeep support(A) >= s",
      use: "Use it for market-basket rules when itemsets are manageable.",
      example: "Discover that bread and butter often appear with milk.",
      demo: "Move the slider to raise support and prune rare combinations."
    },
    "FP-Growth": {
      short: "FP-Growth mines frequent patterns from a compressed transaction tree.",
      how: "It builds an FP-tree, then mines conditional subtrees without generating every candidate.",
      formula: "T -> FP-tree -> conditional patterns",
      use: "Use it for faster frequent-pattern mining on larger baskets.",
      example: "Find product bundles from many receipts using a compact item tree.",
      demo: "Move the slider as low-frequency branches disappear from the tree."
    },
    "Bayesian Ridge": {
      short: "Bayesian Ridge adds uncertainty estimates to ridge regression.",
      how: "It treats weights as random variables and updates their distribution from data.",
      formula: "w ~ N(0, λ^-1 I)\ny ~ N(Xw, α^-1 I)",
      use: "Use it when you want numeric predictions with uncertainty.",
      example: "Predict demand and show a confidence band around the forecast.",
      demo: "Move the slider to tighten or widen the uncertainty band."
    },
    "Elastic Net": {
      short: "Elastic Net blends Ridge stability with Lasso feature selection.",
      how: "It uses both L1 and L2 penalties so related features shrink together while weak ones can drop.",
      formula: "L + λ(α||w||_1 + (1-α)||w||_2^2)",
      use: "Use it when many correlated features exist and some should be removed.",
      example: "Predict medical cost while keeping groups of related health features stable.",
      demo: "Move the slider as L1 removes weak weights and L2 smooths the rest."
    },
    "Gradient Descent (vis)": {
      short: "Gradient Descent visualizes model learning as movement over a loss surface.",
      how: "Each step uses the gradient arrow to move parameters toward lower loss.",
      formula: "θ_t -> θ_(t+1)\nθ_(t+1) = θ_t - η∇L(θ_t)",
      use: "Use it to teach why learning rate and slope control training speed.",
      example: "Watch a bad starting line walk toward a low-error fit.",
      demo: "Move the slider to trace more steps along the loss path."
    }
  };

  const algorithmDemoResults = {
    "Logistic Regression": v => `p=${v}% -> ${v >= 50 ? "positive class" : "negative class"} at t=50%.`,
    "Decision Tree": v => `Depth ${Math.max(1, Math.round(v/25))}: ${v > 65 ? "leaf is reached" : "another split is checked"}.`,
    "KNN": v => `k=${Math.max(1, Math.round(v/12))}: nearest votes choose ${v > 55 ? "Class A" : "Class B"}.`,
    "Naive Bayes": v => `Feature likelihood ${v}% shifts posterior toward ${v > 50 ? "Spam" : "Ham"}.`,
    "SVM (RBF)": v => `γ=${(v/35).toFixed(2)} -> boundary is ${v > 65 ? "more curved" : "smoother"}.`,
    "Perceptron": v => `${Math.round(v/10)} mistakes corrected -> boundary moves toward the right side.`,
    "Ridge Classifier": v => `λ=${(v/25).toFixed(2)} -> weights are ${v > 60 ? "strongly shrunk" : "lightly shrunk"}.`,
    "Linear Regression": v => `x=${Math.round(v/10)} -> y_hat=${35 + Math.round(v*.6)} on the fitted line.`,
    "Polynomial Regression": v => `Curve strength ${v}% -> prediction bends ${v > 60 ? "clearly" : "gently"}.`,
    "Ridge / Lasso": v => `λ=${(v/20).toFixed(2)} -> weak coefficients ${v > 55 ? "drop toward 0" : "stay active"}.`,
    "Random Forest": v => `${Math.max(5, Math.round(v/5))} trees vote -> answer variance gets lower.`,
    "AdaBoost": v => `Mistake weight ${v}% -> next learner focuses on harder rows.`,
    "Gradient Boosting": v => `${Math.max(1, Math.round(v/12))} correction trees added -> residuals shrink.`,
    "XGBoost": v => `Regularized gain ${v}% -> split is ${v > 50 ? "kept" : "pruned"}.`,
    "K-Means": v => `k=${Math.max(2, Math.round(v/22))} centers -> points reassign to nearest μ.`,
    "DBSCAN": v => `ε=${(v/45).toFixed(2)} -> ${v > 60 ? "dense groups expand" : "noise remains separate"}.`,
    "Hierarchical": v => `Cut height ${v}% -> ${Math.max(2, 6 - Math.round(v/25))} cluster levels remain visible.`,
    "Gaussian Mixture": v => `Membership ${v}% -> point belongs mostly to mixture ${v > 50 ? "A" : "B"}.`,
    "OPTICS": v => `Reachability ${v}% -> ${v > 55 ? "a density valley becomes a cluster" : "cluster is still loose"}.`,
    "Mean Shift": v => `Window ${v}% -> points slide ${v > 50 ? "to the main peak" : "to local peaks"}.`,
    "Spectral Clustering": v => `Graph link strength ${v}% -> weak bridge is ${v > 60 ? "cut" : "kept"}.`,
    "PCA": v => `${v}% variance kept -> ${Math.max(1, Math.round(v/30))} principal components shown.`,
    "t-SNE": v => `Perplexity signal ${v}% -> neighborhoods look ${v > 60 ? "broader" : "tighter"}.`,
    "UMAP": v => `Neighbor balance ${v}% -> map favors ${v > 55 ? "global shape" : "local detail"}.`,
    "Kernel PCA": v => `Kernel strength ${v}% -> curved pattern becomes ${v > 60 ? "straighter" : "partly curved"}.`,
    "Factor Analysis": v => `${Math.max(1, Math.round(v/25))} hidden factors explain shared survey patterns.`,
    "FastICA": v => `Independence ${v}% -> mixed signals become ${v > 60 ? "clear sources" : "partly blended"}.`,
    "NMF": v => `${Math.max(2, Math.round(v/18))} additive parts reconstruct the data.`,
    "Truncated SVD": v => `${Math.max(1, Math.round(v/20))} singular values kept -> sparse data is compressed.`,
    "Neural Network": v => `Training ${v}% -> hidden activations become more useful.`,
    "MLP Classifier": v => `Class probability ${v}% -> output node ${v > 50 ? "wins" : "keeps learning"}.`,
    "MLP Regressor": v => `Epoch ${Math.round(v/4)} -> numeric error near ${Math.max(2, 100-v)}%.`,
    "Isolation Forest": v => `Path length ${100-v}% -> ${v > 65 ? "flag anomaly" : "looks normal"}.`,
    "Local Outlier Factor": v => `LOF ratio ${(v/35).toFixed(2)} -> ${v > 55 ? "local outlier" : "local neighbor"}.`,
    "One-Class SVM": v => `Boundary width ${v}% -> new point is ${v > 60 ? "inside normal region" : "outside"}.`,
    "Elliptic Envelope": v => `Mahalanobis distance ${v}% -> ${v > 70 ? "outside ellipse" : "inside ellipse"}.`,
    "Gradient Descent": v => `${Math.round(v/12)} steps -> loss drops to about ${Math.max(3, 100-v)}%.`,
    "Stochastic GD": v => `${Math.round(v/10)} mini-batches -> noisy loss is ${v > 60 ? "settling" : "jumping"}.`,
    "Adam Optimizer": v => `Adaptive step ${v}% -> momentum ${v > 50 ? "smooths the path" : "is still warming up"}.`,
    "Label Propagation": v => `${v}% graph spread -> unlabeled nodes copy nearby labels.`,
    "Label Spreading": v => `α=${(v/100).toFixed(2)} -> labels blend graph influence with anchors.`,
    "Self-Training": v => `${v}% confidence cutoff -> ${v > 65 ? "fewer safer pseudo-labels" : "more pseudo-labels"}.`,
    "Q-Learning": v => `Reward ${v} -> Q-value moves toward best future action.`,
    "SARSA": v => `Reward ${v} -> update follows the action actually taken next.`,
    "Birch": v => `${Math.max(2, Math.round(v/18))} CF summaries -> large data becomes compact.`,
    "Mini-Batch K-Means": v => `Batch size ${v}% -> center μ moves by a small fast update.`,
    "Apriori": v => `Support ${v}% -> ${v > 60 ? "rare itemsets are pruned" : "more itemsets survive"}.`,
    "FP-Growth": v => `Support ${v}% -> FP-tree keeps ${v > 60 ? "only strong branches" : "many branches"}.`,
    "Bayesian Ridge": v => `Uncertainty band ${100-v}% wide -> prediction is ${v > 60 ? "more certain" : "less certain"}.`,
    "Elastic Net": v => `Mix α=${(v/100).toFixed(2)} -> ${v > 50 ? "Lasso effect is stronger" : "Ridge effect is stronger"}.`,
    "Gradient Descent (vis)": v => `${Math.round(v/10)} visual steps traced -> dot moves downhill.`
  };

  function escHtml(value){
    return String(value).replace(/[&<>"']/g, ch => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#39;"
    }[ch]));
  }

  function detailFor(algo){
    const base = familyBase[algo.family];
    const over = {...(overrides[algo.name] || {}), ...(algorithmDetails[algo.name] || {})};
    return {
      short: over.short || base.short,
      how: over.how || base.how,
      formula: over.formula || algorithmFormulas[algo.name] || base.formula,
      use: over.use || base.use,
      example: over.example || algorithmExamples[algo.name] || `Use ${algo.name} when ${base.use.toLowerCase()}`,
      demo: over.demo || algorithmDemos[algo.name] || `Move the slider as ${algo.name} behavior changes.`
    };
  }

  function demoText(algo, value){
    const v = Number(value);
    if(algorithmDemoResults[algo.name]) return algorithmDemoResults[algo.name](v);
    if(algo.family === "regression") return `Study hours ${Math.round(v/10)} -> predicted score ${Math.min(98, 35 + Math.round(v*.6))}%.`;
    if(algo.family === "classification") return `Confidence ${v}% -> ${v >= 50 ? "Class A selected" : "Class B selected"}.`;
    if(algo.family === "ensemble") return `${Math.max(3, Math.round(v/8))} small models vote -> final answer becomes steadier.`;
    if(algo.family === "clustering") return `Searching for about ${Math.max(2, Math.round(v/22))} natural groups.`;
    if(algo.family === "dimension") return `Keep about ${v}% information while showing fewer columns.`;
    if(algo.family === "deep") return `Training progress ${v}% -> visible error is about ${Math.max(2, 100-v)}%.`;
    if(algo.family === "anomaly") return `Unusualness ${v}% -> ${v > 70 ? "flag as anomaly" : "treat as normal"}.`;
    if(algo.family === "optimization") return `Learning rate signal ${v}% -> ${v > 80 ? "may overshoot" : v < 20 ? "very slow" : "healthy step size"}.`;
    if(algo.family === "semi") return `${v}% labelled rows -> label spreading becomes ${v > 50 ? "more reliable" : "more careful"}.`;
    if(algo.family === "rl") return `Reward ${v} -> the agent will prefer this action ${v > 50 ? "more often" : "less often"}.`;
    return `Minimum support ${v}% -> ${v > 60 ? "only very common patterns stay" : "more patterns are allowed"}.`;
  }

  function visualKey(algo){
    return algo;
  }

  function renderGroups(){
    const order = ["Supervised","Ensemble","Unsupervised","Dim. Reduction","Deep Learning","Anomaly","Optimization","Semi-supervised","RL","Association"];
    stack.innerHTML = order.map(group => {
      const algos = visualAlgos.filter(a => a.group === group);
      return `<article class="algo-panel depth-card show">
        <h3>${group}</h3>
        <p>${groupIntro[group]}</p>
        <div class="mini-grid">
          ${algos.map(a => `<div class="algo-chip" role="button" tabindex="0" data-algo-name="${a.name}">
            <strong>${a.name}</strong>
            <span>${detailFor(a).short}</span>
          </div>`).join("")}
        </div>
      </article>`;
    }).join("");
  }

  let breakdown = document.getElementById("algoBreakdown");
  if(!breakdown){
    breakdown = document.createElement("div");
    breakdown.id = "algoBreakdown";
    breakdown.className = "algo-breakdown";
    textEl.insertAdjacentElement("afterend", breakdown);
  }

  let demoBox = document.getElementById("algoDemoBox");
  if(!demoBox){
    demoBox = document.createElement("div");
    demoBox.id = "algoDemoBox";
    demoBox.className = "algo-demo-box";
    breakdown.insertAdjacentElement("afterend", demoBox);
  }

  function selectAlgo(name, shouldScroll = true){
    const algo = visualAlgos.find(a => a.name === name) || visualAlgos[0];
    const d = detailFor(algo);
    document.querySelectorAll(".algo-chip").forEach(c => c.classList.toggle("active", c.dataset.algoName === algo.name));
    titleEl.textContent = algo.name;
    textEl.textContent = d.short;
    breakdown.innerHTML = [
      ["What is this?", d.short],
      ["How it works", d.how],
      ["Formula", d.formula],
      ["How it is used", d.use],
      ["Example", d.example]
    ].map(([h,p]) => `<section><h4>${h}</h4><p class="${h === "Formula" ? "algo-formula" : ""}">${escHtml(p)}</p></section>`).join("");
    demoBox.innerHTML = `
      <h4>Simple live demo</h4>
      <p>${escHtml(d.demo)}</p>
      <input type="range" min="1" max="100" value="55" id="algoDemoSlider" aria-label="${algo.name} demo slider">
      <strong id="algoDemoResult"></strong>`;
    const slider = demoBox.querySelector("#algoDemoSlider");
    const result = demoBox.querySelector("#algoDemoResult");
    const update = () => { result.textContent = demoText(algo, slider.value); };
    slider.addEventListener("input", update);
    update();
    if(typeof setAlgoVisual === "function") setAlgoVisual(visualKey(algo));
    if(shouldScroll) explainer.scrollIntoView({behavior:"smooth", block:"center"});
  }

  renderGroups();
  stack.querySelectorAll(".algo-chip").forEach(chip => {
    chip.addEventListener("click", () => selectAlgo(chip.dataset.algoName));
    chip.addEventListener("keydown", e => {
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        selectAlgo(chip.dataset.algoName);
      }
    });
  });
  selectAlgo("Linear Regression", false);
})();
