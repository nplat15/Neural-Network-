# Clinic Flow: a neural-network wait-time explorer

An interactive, browser-based clinic simulator. Visitors can change queue size, staff on shift, time of day, and weekday and see a neural-network estimate update immediately. A filterable gallery shows held-out visits; visitors reveal the recorded wait to compare it with the model's estimate.

## Run it

From this folder, run:

```sh
node serve.mjs
```

Then open [http://localhost:4173](http://localhost:4173). The browser needs to load `model.json` over HTTP, so opening `index.html` directly as a file will not work.

The optional chat assistant requires a WebGPU-capable browser and internet access on its first launch. It downloads the Qwen3 0.6B model (about 350 MB of files) from the model host and runs generation in a browser worker on the visitor's device. The model's estimated GPU memory requirement is about 1.4 GB. The WebLLM JavaScript runtime is loaded from esm.run. Later visits can reuse the browser's cached model assets.

## Model

`train.mjs` reads `clinic-wait-times.csv`, shuffles the 2,000 observations with a fixed seed, and trains a one-hidden-layer feedforward neural network (8 input features, 12 tanh neurons, 1 output). Inputs are hour, staff count, queue count, and a one-hot weekday. The output is estimated wait in minutes. The fixed 80/20 split gives 1,600 training rows and 400 held-out rows. Model weights, model MAE/RMSE, and the training-mean baseline MAE/RMSE are written to `model.json`; individual held-out inputs, predictions, and actuals for the gallery are written to `gallery.json`.

The available project files do not document the CSV's original source or collection method. The app and chat assistant identify this limitation instead of assuming the records came from a particular clinic or were real-world observations. Evaluation uses a held-out split from this same CSV; no separate external dataset has been tested.

To retrain after replacing or editing the CSV:

```sh
node train.mjs
```

This is a small educational model. Its evaluation error describes this dataset split, not guaranteed accuracy in a real clinic. The observational data supports pattern exploration but does not establish that staffing changes alone cause wait-time changes.

The chat assistant is a separate language model. It receives the current scenario values to explain the simulator; it does not create or alter neural-network predictions. Its answers may be wrong, so use the numerical estimate and held-out gallery as the evidence.
