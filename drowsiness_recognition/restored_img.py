import cv2

def read_img(path):
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Image at {path} could not be read.")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

def read_info(path):
    with open(path, 'r') as f:
        lines = f.readlines()
    return [line.strip() for line in lines]

class_mapping = {0: "Opened Eyes", 1: "Closed Eyes", 2: "Opened Mouth", 3: "Closed Mouth"}

def draw_bbox_on_img(img, info):
    # get the width and height of the image
    img_height, img_width = img.shape[:2]
    for line in info:
        print(line)
        # Split the line into parts
        parts = line.split(" ")
        label = float(parts[0].strip())
        x = float(parts[1].strip())
        y = float(parts[2].strip())
        w = float(parts[3].strip())
        h = float(parts[4].strip())

        # return the original coordinates
        x = int(x * img_width)
        y = int(y * img_height)
        w = int(w * img_width)
        h = int(h * img_height)

        # Draw rectangles for each feature
        cv2.rectangle(img, (int(x), int(y)), (int(x + w), int(y + h)), (255, 0, 0), 2)
        cv2.putText(img, class_mapping[label], (int(x), int(y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    return img

img_path = "dataset/imgs/0_mov_0.jpg"
info_path = "dataset/labels/0_mov_0.txt"
img = read_img(img_path)
info = read_info(info_path)
img = draw_bbox_on_img(img, info)
img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
cv2.imshow("Image with Bounding Boxes", img)
cv2.waitKey(0)
cv2.destroyAllWindows()